import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { Header } from './components/Header';
import { AgentManagerView } from './components/AgentManagerView';
import { HistoryView } from './components/HistoryView';
import { ModelSelector } from './components/ModelSelector';
import type { ModelInfo } from './components/ModelSelector';
import { AdvancedSettings } from './components/AdvancedSettings';
import { IndexingStatusBar } from './components/IndexingStatusBar';
import type { IndexingStatus } from './components/IndexingStatusBar';
import { ModeSelector } from './components/ModeSelector';
import type { ChatMode, AgentModeId } from './components/ModeSelector';
import type { FileSearchResult } from './components/MentionSearch';
import { getAuthToken, setAuthToken, getUser, signOut } from './lib/puter';
import type { CommandApprovalRequest } from './components/CommandApproval';

declare global {
  interface Window {
    __vscode?: {
      postMessage: (message: unknown) => void;
      getState: () => unknown;
      setState: (state: unknown) => void;
    };
    __andorView?: 'sidebar' | 'agent-manager';
  }
}

const vscode = typeof window !== 'undefined' ? window.__vscode ?? null : null;

function getModelValue(model: ModelInfo): string {
  return model.modelSpec || `${model.providerId}::${model.id}`;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: string;
  provider?: string;
  images?: string[];
  contextFiles?: string[];
  isStreaming?: boolean;
  checkpointId?: string;
}

export interface ContextFileInfo {
  path: string;
  relativePath: string;
  reason: string;
}

export interface Checkpoint {
  id: string;
  timestamp: number;
  messages: ChatMessage[];
  label: string;
}

export type PostMessageFn = (message: unknown) => void;

const MAX_PERSISTED_MESSAGES = 50;

type AppView = 'chat' | 'agent-manager' | 'history' | 'profile';

export default function App() {
  const hostView = window.__andorView || 'sidebar';
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [contextFiles, setContextFiles] = useState<ContextFileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<{ signedIn: boolean; username?: string }>({ signedIn: false });
  const [authError, setAuthError] = useState<string | null>(null);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeView, setActiveView] = useState<AppView>(hostView === 'agent-manager' ? 'agent-manager' : 'chat');
  const [allModels, setAllModels] = useState<ModelInfo[]>([]);
  const [pendingCommandApproval, setPendingCommandApproval] = useState<CommandApprovalRequest | null>(null);
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus>({
    state: 'idle', progress: 0, totalFiles: 0, indexedFiles: 0, message: 'Starting...'
  });
  const [fileSearchResults, setFileSearchResults] = useState<FileSearchResult[]>([]);
  const [chatMode, setChatMode] = useState<ChatMode>('agent');
  const [selectedAgentMode, setSelectedAgentMode] = useState<AgentModeId>('code');
  const [thinkingMode, setThinkingMode] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [projectMemory, setProjectMemory] = useState<unknown>(null);
  const pendingSystemPromptRef = useRef<string | null>(null);
  const streamingAssistantIdRef = useRef<string | null>(null);
  const executedLiveBlocksRef = useRef<Set<string>>(new Set());

  // Load state from VS Code webview state on mount
  useEffect(() => {
    try {
      const savedState = vscode?.getState?.() as {
        messages?: ChatMessage[];
        selectedModel?: string;
        checkpoints?: Checkpoint[];
      } | undefined;
      if (savedState?.messages && Array.isArray(savedState.messages)) {
        const safe = savedState.messages.filter(
          (m) => m && m.id && m.role && typeof m.content === 'string' && m.timestamp
        );
        setMessages(safe);
      }
      if (savedState?.selectedModel) {
        setSelectedModel(savedState.selectedModel);
      }
      if (savedState?.checkpoints && Array.isArray(savedState.checkpoints)) {
        setCheckpoints(savedState.checkpoints);
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist state
  useEffect(() => {
    try {
      const currentState = vscode?.getState?.() ?? {};
      vscode?.setState?.({
        ...currentState,
        messages: messages.slice(-MAX_PERSISTED_MESSAGES),
        selectedModel,
        checkpoints: checkpoints.slice(-10),
      });
    } catch {
      // ignore
    }
  }, [messages, selectedModel, checkpoints]);

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      getUser().then((user) => {
        setAuthStatus({ signedIn: true, username: user?.username });
      });
    } else {
      setAuthStatus({ signedIn: false });
    }
  }, []);

  // Fetch models and indexing status from extension on mount
  useEffect(() => {
    postMessage({ type: 'getModels' });
    postMessage({ type: 'getIndexingStatus' });
    postMessage({ type: 'getMemory' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (allModels.length === 0) {
      return;
    }
    const hasSelectedModel = allModels.some((model) => getModelValue(model) === selectedModel || model.id === selectedModel);
    if (hasSelectedModel) {
      return;
    }
    const preferredModel = allModels[0];
    if (preferredModel) {
      setSelectedModel(getModelValue(preferredModel));
    }
  }, [allModels, selectedModel]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.type) {
        case 'puterToken':
          if (msg.token && typeof msg.token === 'string') {
            setAuthToken(msg.token);
            getUser().then((user) => {
              setAuthStatus({ signedIn: true, username: user?.username });
            });
            setAuthError(null);
          }
          break;
        case 'context':
          if (msg.files) {
            setContextFiles(msg.files.map((f: ContextFileInfo) => ({
              path: f.path,
              relativePath: f.relativePath,
              reason: f.reason,
            })));
          }
          break;
        case 'historyCleared':
          setMessages([]);
          setContextFiles([]);
          break;
        case 'models':
          if (msg.models && Array.isArray(msg.models)) {
            setAllModels((current) => msg.models.length > 0 ? msg.models : current);
          }
          break;
        case 'terminalResult':
          setMessages((prev: ChatMessage[]) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `\`\`\`terminal:command\n$ ${msg.command ?? '(terminal)'}\n${msg.output ?? ''}\n\`\`\`\nExit code: ${msg.exitCode ?? 0}`,
              timestamp: Date.now(),
              isStreaming: false,
            },
          ]);
          break;
        case 'fileWritten':
          setMessages((prev: ChatMessage[]) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `✅ File written: \`${msg.filePath}\``,
              timestamp: Date.now(),
              isStreaming: false,
            },
          ]);
          break;
        case 'commandApproval':
          if (msg.commandApproval) {
            setPendingCommandApproval(msg.commandApproval);
          }
          break;
        case 'streamChunk': {
          const assistantId = streamingAssistantIdRef.current;
          if (assistantId && msg.text != null) {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: msg.text, isStreaming: true } : m)
            );
            // Live write completed write: blocks during stream
            const writeRegex = /```write:([^\n]+)\n([\s\S]*?)```/g;
            let wm: RegExpExecArray | null;
            const text: string = msg.text;
            while ((wm = writeRegex.exec(text)) !== null) {
              const fp = wm[1].trim();
              const content = wm[2];
              const key = `write:${fp}:${content.length}`;
              if (!executedLiveBlocksRef.current.has(key)) {
                executedLiveBlocksRef.current.add(key);
                vscode?.postMessage({ type: 'writeFile', filePath: fp, content });
              }
            }
          }
          break;
        }
        case 'streamDone': {
          const doneId = streamingAssistantIdRef.current;
          if (doneId && msg.text != null) {
            setMessages(prev =>
              prev.map(m => m.id === doneId ? { ...m, content: msg.text, isStreaming: false, model: msg.model, provider: msg.provider } : m)
            );
            setIsLoading(false);
            streamingAssistantIdRef.current = null;
            // Run terminal blocks on completion
            const runRegex = /```run\n([\s\S]*?)```/g;
            let rm: RegExpExecArray | null;
            const doneText: string = msg.text;
            while ((rm = runRegex.exec(doneText)) !== null) {
              const command = rm[1].trim();
              const key = `run:${command}`;
              if (!executedLiveBlocksRef.current.has(key)) {
                executedLiveBlocksRef.current.add(key);
                vscode?.postMessage({ type: 'runTerminal', command });
              }
            }
            executedLiveBlocksRef.current = new Set();
          }
          break;
        }
        case 'streamError': {
          const errId = streamingAssistantIdRef.current;
          if (errId) {
            setMessages(prev =>
              prev.map(m => m.id === errId ? { ...m, content: `Error: ${msg.error}`, isStreaming: false } : m)
            );
            setIsLoading(false);
            streamingAssistantIdRef.current = null;
          } else {
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `Error: ${msg.error}`,
              timestamp: Date.now(),
              isStreaming: false,
            }]);
            setIsLoading(false);
          }
          break;
        }
        case 'indexingStatus':
          if (msg.indexingStatus) {
            setIndexingStatus(msg.indexingStatus);
          }
          break;
        case 'fileSearchResults':
          if (msg.searchResults) {
            setFileSearchResults(msg.searchResults);
          }
          break;
        case 'memoryData':
          if (msg.memory) {
            setProjectMemory(msg.memory);
          }
          break;
        case 'error':
          setIsLoading(false);
          setMessages((prev: ChatMessage[]) => {
            const updated = [...prev];
            const lastAssistant = updated.findLastIndex((m: ChatMessage) => m.role === 'assistant');
            if (lastAssistant >= 0 && updated[lastAssistant].isStreaming) {
              updated[lastAssistant] = {
                ...updated[lastAssistant],
                content: `Error: ${msg.error}`,
                isStreaming: false,
              };
            } else {
              updated.push({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Error: ${msg.error}`,
                timestamp: Date.now(),
                isStreaming: false,
              });
            }
            return updated;
          });
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const postMessage = useCallback((message: unknown) => {
    vscode?.postMessage(message);
  }, []);

  const createCheckpoint = useCallback((msgs: ChatMessage[], label: string): string => {
    const id = crypto.randomUUID();
    setCheckpoints(prev => [...prev, { id, timestamp: Date.now(), messages: [...msgs], label }]);
    return id;
  }, []);

  const revertToCheckpoint = useCallback((checkpointId: string) => {
    const cp = checkpoints.find(c => c.id === checkpointId);
    if (cp) {
      setMessages(cp.messages);
      setIsLoading(false);
      setShowCheckpoints(false);
    }
  }, [checkpoints]);

  const handleClearHistory = useCallback(() => {
    setMessages([]);
    setContextFiles([]);
    setIsLoading(false);
    setCheckpoints([]);
    setActiveView('chat');
    postMessage({ type: 'clearHistory' });
  }, [postMessage]);

  const handleSignIn = useCallback(async () => {
    setAuthError(null);
    postMessage({ type: 'startPuterAuth' });
  }, [postMessage]);

  const handleSignOut = useCallback(() => {
    signOut();
    setAuthToken(null);
    setAuthStatus({ signedIn: false });
    setAuthError(null);
    postMessage({ type: 'logout' });
  }, [postMessage]);

  // Check if the selected model is a Puter model (handled by webview)
  const isPuterModel = useCallback((modelId: string): boolean => {
    const model = allModels.find(m => getModelValue(m) === modelId || m.id === modelId);
    if (!model) { return true; } // Default to Puter for unknown models
    return model.providerId === 'puter';
  }, [allModels]);

  if (showSettings || showMemory) {
    return (
      <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--vscode-sideBar-background)', color: 'var(--vscode-sideBar-foreground)' }}>
        <AdvancedSettings
          postMessage={postMessage}
          onClose={() => {
            setShowSettings(false);
            setShowMemory(false);
            if (hostView === 'agent-manager') {
              setActiveView('agent-manager');
            }
            postMessage({ type: 'getModels' });
          }}
          memory={projectMemory}
          indexingStatus={indexingStatus}
        />
      </div>
    );
  }

  const renderMainView = () => {
    if (activeView === 'agent-manager') {
      return (
        <AgentManagerView
          messages={messages}
          onBackToChat={() => setActiveView('chat')}
          onSubmitTask={(text) => {
            const userMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'user',
              content: text,
              timestamp: Date.now(),
              contextFiles: contextFiles.map((file) => file.relativePath),
            };

            setMessages((prev) => [...prev, userMessage, {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              model: selectedModel,
              isStreaming: true,
            }]);
            setIsLoading(true);

            const history = messages
              .filter((message) => !message.isStreaming)
              .slice(-6)
              .map((message) => ({ role: message.role, content: message.content }));

            postMessage({
              type: 'streamWithProvider',
              text,
              model: selectedModel,
              history,
            });
          }}
          isLoading={isLoading}
        />
      );
    }

    if (activeView === 'history') {
      return <HistoryView checkpoints={checkpoints} onBack={() => setActiveView('chat')} onSelect={revertToCheckpoint} />;
    }

    if (activeView === 'profile') {
      return (
        <div className="flex h-full items-center justify-center px-6" style={{ background: 'var(--vscode-sideBar-background)' }}>
          <div className="max-w-md rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--vscode-panel-border)' }}>
            <div className="mb-2 text-lg font-semibold">Profile</div>
            <div className="text-sm opacity-65">
              Profile management UI is queued next. Your auth state is still active in the chat experience.
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
        {/* Model selector */}
        <div className="px-3 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
          <ModelSelector selected={selectedModel} onChange={setSelectedModel} models={allModels} />
        </div>

        {/* Mode selector: Chat vs Agent + Thinking toggle */}
        <ModeSelector
          mode={chatMode}
          onChange={setChatMode}
          thinking={thinkingMode}
          onThinkingChange={setThinkingMode}
          selectedAgentMode={selectedAgentMode}
          onAgentModeChange={setSelectedAgentMode}
        />

        {/* Indexing status bar */}
        <IndexingStatusBar
          status={indexingStatus}
          onRefresh={() => postMessage({ type: 'getIndexingStatus' })}
        />

        {/* Checkpoint panel */}
        {showCheckpoints && (
          <div className="flex-shrink-0 px-3 py-2 overflow-y-auto max-h-40" style={{ borderBottom: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-input-background)' }}>
            <div className="text-[10px] font-semibold opacity-60 mb-1.5">Checkpoints — click to revert</div>
            <div className="space-y-1">
              {[...checkpoints].reverse().map(cp => (
                <button
                  key={cp.id}
                  onClick={() => revertToCheckpoint(cp.id)}
                  className="w-full text-left text-[10px] px-2 py-1.5 rounded hover:opacity-90"
                  style={{ background: 'var(--vscode-button-secondaryBackground, #3a3a3a)', color: 'var(--vscode-foreground)' }}
                >
                  <span className="opacity-50">{new Date(cp.timestamp).toLocaleTimeString()} · </span>
                  <span>{cp.label}</span>
                  <span className="opacity-40 ml-1">({cp.messages.length} msgs)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatPanel
            messages={messages}
            setMessages={setMessages}
            contextFiles={contextFiles}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            selectedModel={selectedModel}
            postMessage={postMessage}
            pendingSystemPromptRef={pendingSystemPromptRef}
            onCreateCheckpoint={createCheckpoint}
            isPuterModel={isPuterModel}
            streamingAssistantIdRef={streamingAssistantIdRef}
            pendingCommandApproval={pendingCommandApproval}
            onDismissCommandApproval={() => setPendingCommandApproval(null)}
            chatMode={chatMode}
            selectedAgentMode={selectedAgentMode}
            thinkingMode={thinkingMode}
          />
        </div>
      </>
    );
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--vscode-sideBar-background)', color: 'var(--vscode-sideBar-foreground)' }}>
      <Header 
        onNewChat={handleClearHistory}
        onOpenAgents={() => {
          if (hostView === 'agent-manager') {
            setActiveView('agent-manager');
            return;
          }
          postMessage({ type: 'openExternal', url: 'command:andor.openAgentManager' });
        }}
        onOpenMarketplace={() => setShowSettings(true)}
        onOpenHistory={() => setActiveView('history')}
        onOpenProfile={() => setActiveView('profile')}
        onOpenSettings={() => setShowSettings(true)}
      />

      {renderMainView()}
    </div>
  );
}
