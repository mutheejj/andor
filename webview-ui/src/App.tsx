import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { ModelSelector } from './components/ModelSelector';
import type { ModelInfo } from './components/ModelSelector';
import { AdvancedSettings } from './components/AdvancedSettings';
import { IndexingStatusBar } from './components/IndexingStatusBar';
import type { IndexingStatus } from './components/IndexingStatusBar';
import { ModeSelector } from './components/ModeSelector';
import type { ChatMode } from './components/ModeSelector';
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
  }
}

const vscode = typeof window !== 'undefined' ? window.__vscode ?? null : null;

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

export default function App() {
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [contextFiles, setContextFiles] = useState<ContextFileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<{ signedIn: boolean; username?: string }>({ signedIn: false });
  const [authError, setAuthError] = useState<string | null>(null);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [allModels, setAllModels] = useState<ModelInfo[]>([]);
  const [pendingCommandApproval, setPendingCommandApproval] = useState<CommandApprovalRequest | null>(null);
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus>({
    state: 'idle', progress: 0, totalFiles: 0, indexedFiles: 0, message: 'Starting...'
  });
  const [fileSearchResults, setFileSearchResults] = useState<FileSearchResult[]>([]);
  const [chatMode, setChatMode] = useState<ChatMode>('agent');
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
            setAllModels(msg.models);
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
    const model = allModels.find(m => m.id === modelId);
    if (!model) { return true; } // Default to Puter for unknown models
    return model.providerId === 'puter';
  }, [allModels]);

  if (showSettings || showMemory) {
    return (
      <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--vscode-sideBar-background)', color: 'var(--vscode-sideBar-foreground)' }}>
        <AdvancedSettings
          postMessage={postMessage}
          onClose={() => { setShowSettings(false); setShowMemory(false); postMessage({ type: 'getModels' }); }}
          memory={projectMemory}
          indexingStatus={indexingStatus}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--vscode-sideBar-background)', color: 'var(--vscode-sideBar-foreground)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--vscode-panel-border)', minHeight: '44px' }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-[12px]" style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}>
            ⬡
          </div>
          <span className="text-sm font-bold tracking-wide" style={{ color: 'var(--vscode-foreground)' }}>Andor</span>
          {authStatus.signedIn && authStatus.username && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full opacity-60" style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>
              {authStatus.username}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {authError && (
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--vscode-inputValidation-errorBackground, #5a1d1d)', color: 'var(--vscode-inputValidation-errorForeground, #f48771)' }} title={authError}>⚠</span>
          )}
          {checkpoints.length > 0 && (
            <button
              onClick={() => setShowCheckpoints(v => !v)}
              className="text-[10px] px-2 py-1 rounded transition-opacity hover:opacity-100 opacity-70"
              style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-foreground)' }}
              title="View checkpoints / revert"
            >
              ↩ {checkpoints.length}
            </button>
          )}
          <button
            onClick={handleClearHistory}
            className="text-[10px] px-2 py-1 rounded transition-opacity hover:opacity-100 opacity-80"
            style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
            title="New Chat"
          >
            + New
          </button>
          <button
            onClick={() => { setShowMemory(true); postMessage({ type: 'getMemory' }); }}
            className="text-[10px] px-2 py-1 rounded transition-opacity hover:opacity-100 opacity-70"
            style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-foreground)' }}
            title="Memory & learned context"
          >
            🧠
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="text-[10px] px-2 py-1 rounded transition-opacity hover:opacity-100 opacity-70"
            style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-foreground)' }}
            title="Settings"
          >
            ⚙
          </button>
          {authStatus.signedIn ? (
            <button
              onClick={handleSignOut}
              className="text-[10px] px-2 py-1 rounded opacity-70 hover:opacity-100"
              style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-foreground)' }}
              title={`Sign out (${authStatus.username || ''})`}
            >
              Sign out
            </button>
          ) : (
            <button
              onClick={handleSignIn}
              className="text-[10px] px-2 py-1 rounded transition-opacity hover:opacity-100 opacity-90"
              style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
              title="Sign in with Puter"
            >
              Sign in
            </button>
          )}
        </div>
      </div>

      {/* Model selector */}
      <div className="px-3 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <ModelSelector selected={selectedModel} onChange={setSelectedModel} models={allModels} />
      </div>

      {/* Mode selector: Chat vs Agent + Thinking toggle */}
      <ModeSelector mode={chatMode} onChange={setChatMode} thinking={thinkingMode} onThinkingChange={setThinkingMode} />

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

      {/* Chat */}
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
          thinkingMode={thinkingMode}
        />
      </div>
    </div>
  );
}
