import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CodeBlock } from './CodeBlock';
import { DiffViewer } from './DiffViewer';
import { ImageUploader } from './ImageUploader';
import { CommandApproval } from './CommandApproval';
import type { CommandApprovalRequest } from './CommandApproval';
import { TerminalOutput } from './TerminalOutput';
import { ThinkingBlock } from './ThinkingBlock';
import { FileReview } from './FileReview';
import type { ReviewedFile } from './FileReview';
import { TerminalCommandBlock } from './TerminalCommandBlock';
import { FilePicker } from './FilePicker';
import type { FileEntry } from './FilePicker';
import { WebSearchResults } from './WebSearchResults';
import type { SearchResult } from './WebSearchResults';
import { PromptImprover } from './PromptImprover';
import { AgentDashboard } from './AgentDashboard';
import type { AgentDashboardState } from './AgentDashboard';
import type { ChatMode } from './ModeSelector';
import { streamChat } from '../lib/puter';
import type { ChatMessage, ContextFileInfo, PostMessageFn } from '../App';

interface ChatPanelProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  contextFiles: ContextFileInfo[];
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  selectedModel: string;
  postMessage: PostMessageFn;
  pendingSystemPromptRef: React.MutableRefObject<string | null>;
  onCreateCheckpoint: (msgs: ChatMessage[], label: string) => string;
  isPuterModel: (modelId: string) => boolean;
  streamingAssistantIdRef: React.MutableRefObject<string | null>;
  pendingCommandApproval: CommandApprovalRequest | null;
  onDismissCommandApproval: () => void;
  chatMode: ChatMode;
  thinkingMode: boolean;
}

interface DiffState {
  filePath: string;
  originalContent: string;
  newContent: string;
  code: string;
  language: string;
}

interface ParsedBlock {
  type: 'text' | 'code';
  content: string;
  language?: string;
  filePath?: string;
}

function parseMessageContent(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const codeBlockRegex = /```(\w*)?(?::([^\n]*))?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) {
        blocks.push({ type: 'text', content: text });
      }
    }

    blocks.push({
      type: 'code',
      language: match[1] || 'plaintext',
      filePath: match[2]?.trim() || undefined,
      content: match[3].trimEnd(),
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) {
      blocks.push({ type: 'text', content: text });
    }
  }

  if (blocks.length === 0 && content.trim()) {
    blocks.push({ type: 'text', content: content.trim() });
  }

  return blocks;
}

function renderMarkdownText(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Bold
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    line = line.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    line = line.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-sm font-semibold mt-3 mb-1" dangerouslySetInnerHTML={{ __html: line.slice(4) }} />
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-sm font-bold mt-3 mb-1" dangerouslySetInnerHTML={{ __html: line.slice(3) }} />
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-base font-bold mt-3 mb-1" dangerouslySetInnerHTML={{ __html: line.slice(2) }} />
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-2">
          <span className="opacity-50">•</span>
          <span dangerouslySetInnerHTML={{ __html: line.slice(2) }} />
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const numMatch = line.match(/^(\d+)\.\s(.*)$/);
      if (numMatch) {
        elements.push(
          <div key={i} className="flex gap-1.5 ml-2">
            <span className="opacity-50">{numMatch[1]}.</span>
            <span dangerouslySetInnerHTML={{ __html: numMatch[2] }} />
          </div>
        );
      }
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: line }} />
      );
    }
  }

  return elements;
}

/**
 * Renders assistant message content with support for:
 * - <thinking>...</thinking> blocks → ThinkingBlock component
 * - ```terminal:command blocks → TerminalCommandBlock component  
 * - ```write:filepath blocks → FileReview entries + CodeBlock
 * - Regular code blocks → CodeBlock
 * - Markdown text → renderMarkdownText
 */
function renderAssistantContent(
  content: string,
  isStreaming: boolean,
  handleApplyCode: (code: string, filePath: string, language: string) => void,
  handleRequestDiff: (code: string, filePath: string, language: string) => void,
  postMessage: (msg: unknown) => void,
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let remaining = content;
  let key = 0;

  // Extract <thinking> blocks
  while (remaining.includes('<thinking>')) {
    const startIdx = remaining.indexOf('<thinking>');
    const endIdx = remaining.indexOf('</thinking>');

    // Render text before thinking block
    if (startIdx > 0) {
      const before = remaining.slice(0, startIdx).trim();
      if (before) {
        elements.push(...renderParsedBlocks(before, key, handleApplyCode, handleRequestDiff));
        key += 100;
      }
    }

    if (endIdx > startIdx) {
      const thinkingContent = remaining.slice(startIdx + 10, endIdx).trim();
      elements.push(
        <ThinkingBlock key={`think-${key++}`} content={thinkingContent} isActive={false} />
      );
      remaining = remaining.slice(endIdx + 12);
    } else {
      // Still streaming the thinking block
      const thinkingContent = remaining.slice(startIdx + 10).trim();
      elements.push(
        <ThinkingBlock key={`think-${key++}`} content={thinkingContent} isActive={isStreaming} />
      );
      remaining = '';
    }
  }

  // Render remaining content
  if (remaining.trim()) {
    elements.push(...renderParsedBlocks(remaining, key, handleApplyCode, handleRequestDiff));
  }

  return elements;
}

function renderParsedBlocks(
  content: string,
  startKey: number,
  handleApplyCode: (code: string, filePath: string, language: string) => void,
  handleRequestDiff: (code: string, filePath: string, language: string) => void,
): React.ReactNode[] {
  const blocks = parseMessageContent(content);
  let key = startKey;
  const fileActions: Array<{ path: string; relativePath: string; language: string; action: 'read' | 'edit' | 'create' }> = [];

  const elements = blocks.map((block) => {
    key++;
    if (block.type === 'code') {
      // Detect terminal blocks
      if (block.language === 'terminal' || block.filePath === 'command') {
        const lines = block.content.split('\n');
        const command = lines[0]?.replace(/^\$\s*/, '') || '';
        const output = lines.slice(1).join('\n');
        return (
          <TerminalCommandBlock
            key={`term-${key}`}
            command={command}
            output={output}
            status="done"
            exitCode={0}
          />
        );
      }

      // Detect write blocks — track for file review
      if (block.filePath) {
        const ext = block.filePath.split('.').pop() || '';
        const langMap: Record<string, string> = {
          ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
          py: 'python', go: 'go', rs: 'rust', html: 'html', css: 'css', json: 'json',
          md: 'markdown', yaml: 'yaml', yml: 'yaml',
        };
        fileActions.push({
          path: block.filePath,
          relativePath: block.filePath,
          language: langMap[ext] || 'plaintext',
          action: 'edit',
        });
      }

      return (
        <CodeBlock
          key={`code-${key}`}
          code={block.content}
          language={block.language || 'plaintext'}
          filePath={block.filePath}
          onApply={block.filePath ? handleApplyCode : undefined}
          onRequestDiff={block.filePath ? handleRequestDiff : undefined}
        />
      );
    }
    return <div key={`text-${key}`}>{renderMarkdownText(block.content)}</div>;
  });

  // Add file review summary if there were file actions
  if (fileActions.length > 0) {
    elements.unshift(
      <FileReview
        key={`review-${startKey}`}
        files={fileActions}
        title={`${fileActions.length} file${fileActions.length !== 1 ? 's' : ''} changed`}
      />
    );
  }

  return elements;
}

const TASK_COMPLETE_SIGNALS = [
  /task (is )?complete/i,
  /all (done|finished|changes made)/i,
  /i('ve| have) (completed|finished|made all)/i,
  /everything (is |has been )?(done|implemented|applied|updated)/i,
  /let me know if you('d like| want| need)/i,
  /feel free to (ask|let me know)/i,
  /the (implementation|changes|refactor|fix) (is|are) (complete|done|finished)/i,
];

function detectTaskCompletion(text: string): boolean {
  return TASK_COMPLETE_SIGNALS.some(r => r.test(text));
}

export function ChatPanel({
  messages,
  setMessages,
  contextFiles,
  isLoading,
  setIsLoading,
  selectedModel,
  postMessage,
  pendingSystemPromptRef,
  onCreateCheckpoint,
  isPuterModel,
  streamingAssistantIdRef,
  pendingCommandApproval,
  onDismissCommandApproval,
  chatMode,
  thinkingMode,
}: ChatPanelProps) {
  const [inputText, setInputText] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [activeDiff, setActiveDiff] = useState<DiffState | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [taskComplete, setTaskComplete] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState('');
  const [filePickerMode, setFilePickerMode] = useState<'slash' | 'button'>('slash');
  const [projectFiles, setProjectFiles] = useState<FileEntry[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<FileEntry[]>([]);
  const [webSearchResults, setWebSearchResults] = useState<SearchResult[]>([]);
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [agentDashboard, setAgentDashboard] = useState<AgentDashboardState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingChatRef = useRef<{ userText: string; images: string[] } | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Request project files on mount
  useEffect(() => {
    postMessage({ type: 'listProjectFiles' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleExtMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'response' && msg.text) {
        try {
          const data = JSON.parse(msg.text);
          const pending = pendingChatRef.current;
          if (pending && data.systemPrompt) {
            pendingChatRef.current = null;
            doStreamChat(data.systemPrompt, pending.userText, data.model || selectedModel, pending.images);
          }
        } catch {
          // ignore
        }
      } else if (msg.type === 'diffResult' && msg.diff) {
        setActiveDiff({
          filePath: msg.diff.filePath,
          originalContent: msg.diff.originalContent,
          newContent: msg.diff.newContent,
          code: msg.diff.newContent,
          language: '',
        });
      } else if (msg.type === 'projectFiles' && msg.files) {
        setProjectFiles(msg.files as FileEntry[]);
      } else if (msg.type === 'webSearchResults') {
        setWebSearchResults(msg.results || []);
        setWebSearchQuery(msg.query || '');
      } else if (msg.type === 'agentDashboardUpdate') {
        setAgentDashboard(msg.state || null);
      }
    };

    window.addEventListener('message', handleExtMessage);
    return () => window.removeEventListener('message', handleExtMessage);
  }, [selectedModel]);

  // Track which blocks we've already auto-executed in the current response
  const executedBlocksRef = useRef<Set<string>>(new Set());

  // Called on every streaming chunk — writes files the moment blocks are complete
  const autoExecuteLive = useCallback((fullText: string) => {
    // Write blocks: ```write:path\ncontent```
    const writeRegex = /```write:([^\n]+)\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = writeRegex.exec(fullText)) !== null) {
      const filePath = m[1].trim();
      const content = m[2];
      const key = `write:${filePath}:${content.length}`;
      if (!executedBlocksRef.current.has(key)) {
        executedBlocksRef.current.add(key);
        postMessage({ type: 'writeFile', filePath, content });
      }
    }
    // Run blocks: ```run\ncommand```  — only run after streaming done (safety)
  }, [postMessage]);

  const autoExecuteBlocks = useCallback((fullText: string) => {
    // Run terminal blocks on completion
    const runRegex = /```run\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = runRegex.exec(fullText)) !== null) {
      const command = m[1].trim();
      const key = `run:${command}`;
      if (!executedBlocksRef.current.has(key)) {
        executedBlocksRef.current.add(key);
        postMessage({ type: 'runTerminal', command });
      }
    }
    // Also handle any write blocks not yet written (in case stream ended without triggering live write)
    autoExecuteLive(fullText);
    // Reset tracker for next response
    executedBlocksRef.current = new Set();
  }, [postMessage, autoExecuteLive]);

  const doStreamChat = async (
    systemPrompt: string,
    userMessage: string,
    model: string,
    userImages: string[],
  ) => {
    const assistantId = crypto.randomUUID();
    setTaskComplete(false);

    setMessages(prev => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        model,
        isStreaming: true,
      },
    ]);

    const compressedSystemPrompt = systemPrompt
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    const chatMessages: Array<{ role: string; content: unknown }> = [
      { role: 'system', content: compressedSystemPrompt },
    ];

    const recentMessages = messagesRef.current.slice(-6);
    for (const msg of recentMessages) {
      if (msg.role === 'user') {
        chatMessages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant' && !msg.isStreaming) {
        chatMessages.push({ role: 'assistant', content: msg.content });
      }
    }

    if (userImages && userImages.length > 0) {
      const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: 'text', text: userMessage },
      ];
      for (const img of userImages) {
        parts.push({ type: 'image_url', image_url: { url: img } });
      }
      chatMessages.push({ role: 'user', content: parts as unknown });
    } else {
      chatMessages.push({ role: 'user', content: userMessage });
    }

    await streamChat(
      chatMessages,
      model,
      (fullText) => {
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: fullText, isStreaming: true } : m)
        );
        // Live write: apply completed write: blocks immediately during stream
        autoExecuteLive(fullText);
      },
      (fullText) => {
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: fullText, isStreaming: false } : m)
        );
        setIsLoading(false);
        autoExecuteBlocks(fullText);
        if (detectTaskCompletion(fullText)) {
          setTaskComplete(true);
        }
      },
      (error) => {
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: `Error: ${error}`, isStreaming: false } : m)
        );
        setIsLoading(false);
      },
    );
  };

  // Build thinking mode prefix for system prompt
  const getThinkingPrefix = useCallback(() => {
    if (!thinkingMode) return '';
    return `\n\n[THINKING MODE ENABLED]\nBefore making any changes, you MUST first output a <thinking> block explaining:\n1. What you understand about the request\n2. What files need to change and why\n3. What approach you'll take\n4. Potential risks or side effects\n5. Your verification plan\nFormat: <thinking>\n...your analysis...\n</thinking>\nThen proceed with your response.\n`;
  }, [thinkingMode]);

  // Build mode prefix for system prompt
  const getModePrefix = useCallback(() => {
    if (chatMode === 'chat') {
      return '\n\n[CHAT MODE] You are in chat-only mode. Do NOT write files, run commands, or make any edits. Only answer questions, explain code, discuss approaches, and provide guidance. If the user asks you to make changes, explain what you would do but do not output write: or run blocks.\n';
    }
    return '\n\n[AGENT MODE] You are in agent mode. You can read files, write files, run terminal commands, and make edits to the codebase. Use ```write:filepath and ```run blocks to take actions.\n';
  }, [chatMode]);

  const sendMessage = useCallback((text: string, images: string[]) => {
    onCreateCheckpoint(messagesRef.current, text.slice(0, 60));

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      images: images.length > 0 ? [...images] : undefined,
      contextFiles: contextFiles.map(f => f.relativePath),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setTaskComplete(false);

    // Append mode and thinking prefixes to the message
    const modeContext = getModePrefix() + getThinkingPrefix();

    if (isPuterModel(selectedModel)) {
      pendingChatRef.current = { userText: text, images };
      postMessage({ type: 'sendMessage', text, model: selectedModel, images, systemPrompt: modeContext || undefined });
    } else {
      const assistantId = crypto.randomUUID();
      streamingAssistantIdRef.current = assistantId;
      setMessages(prev => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          model: selectedModel,
          isStreaming: true,
        },
      ]);

      const recentMessages = messagesRef.current.slice(-6);
      const history = recentMessages
        .filter(m => !m.isStreaming)
        .map(m => ({ role: m.role, content: m.content }));

      postMessage({
        type: 'streamWithProvider',
        text,
        model: selectedModel,
        images,
        history,
        systemPrompt: modeContext || undefined,
      });
    }
  }, [contextFiles, selectedModel, postMessage, setMessages, setIsLoading, onCreateCheckpoint, isPuterModel, streamingAssistantIdRef, getModePrefix, getThinkingPrefix]);

  const handleSend = () => {
    let text = inputText.trim();
    if (!text || isLoading) return;

    // Prepend attached file paths as context
    if (attachedFiles.length > 0) {
      const fileList = attachedFiles.map(f => f.relativePath).join(', ');
      text = `[Attached files: ${fileList}]\n\n${text}`;
    }

    const imgs = [...uploadedImages];
    setInputText('');
    setUploadedImages([]);
    setAttachedFiles([]);
    sendMessage(text, imgs);
  };

  const handleContinue = () => {
    setTaskComplete(false);
    sendMessage('Continue with the next steps. If everything is complete, summarize what was done.', []);
  };

  // Handle input changes — detect / trigger for file picker
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputText(value);

    // Detect / at start of line or after space
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastSlashIdx = textBeforeCursor.lastIndexOf('/');

    if (lastSlashIdx >= 0) {
      const charBeforeSlash = lastSlashIdx > 0 ? textBeforeCursor[lastSlashIdx - 1] : ' ';
      if (charBeforeSlash === ' ' || charBeforeSlash === '\n' || lastSlashIdx === 0) {
        const query = textBeforeCursor.slice(lastSlashIdx + 1);
        // Only show picker if query doesn't contain spaces (still typing a path)
        if (!query.includes(' ')) {
          setFilePickerQuery(query);
          setFilePickerMode('slash');
          setShowFilePicker(true);
          return;
        }
      }
    }

    if (showFilePicker && filePickerMode === 'slash') {
      setShowFilePicker(false);
    }
  };

  // Handle file selection from picker
  const handleFileSelect = useCallback((file: FileEntry) => {
    if (filePickerMode === 'slash') {
      // Replace the /query with the file path in the input
      const cursorPos = textareaRef.current?.selectionStart || inputText.length;
      const textBeforeCursor = inputText.slice(0, cursorPos);
      const lastSlashIdx = textBeforeCursor.lastIndexOf('/');
      if (lastSlashIdx >= 0) {
        const before = inputText.slice(0, lastSlashIdx);
        const after = inputText.slice(cursorPos);
        setInputText(before + file.relativePath + ' ' + after);
      }
    }

    // Add to attached files if not already there
    if (!attachedFiles.find(f => f.path === file.path)) {
      setAttachedFiles(prev => [...prev, file]);
      // Request the file content to be included as context
      postMessage({ type: 'attachFiles', filePaths: [file.path] });
    }

    setShowFilePicker(false);
    setFilePickerQuery('');
    textareaRef.current?.focus();
  }, [filePickerMode, inputText, attachedFiles, postMessage]);

  const handleRemoveAttachedFile = (filePath: string) => {
    setAttachedFiles(prev => prev.filter(f => f.path !== filePath));
  };

  const handleWebSearch = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    postMessage({ type: 'webSearch', text });
  }, [inputText, postMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't handle Enter/etc when file picker is open (it handles them)
    if (showFilePicker) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEditMessage = (msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setEditingContent(msg.content);
    setTimeout(() => editTextareaRef.current?.focus(), 50);
  };

  const handleEditSave = (msgId: string) => {
    const newContent = editingContent.trim();
    if (!newContent) return;

    const msgIndex = messagesRef.current.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    onCreateCheckpoint(messagesRef.current, `Edit: ${newContent.slice(0, 40)}`);

    const truncatedMessages = messagesRef.current.slice(0, msgIndex);
    setMessages(truncatedMessages);
    setEditingMessageId(null);
    setEditingContent('');

    setTimeout(() => {
      sendMessage(newContent, []);
    }, 50);
  };

  const handleEditCancel = () => {
    setEditingMessageId(null);
    setEditingContent('');
  };

  const handleRevertBefore = (msgId: string) => {
    const idx = messagesRef.current.findIndex(m => m.id === msgId);
    if (idx > 0) {
      onCreateCheckpoint(messagesRef.current, `Revert before msg ${idx + 1}`);
      setMessages(messagesRef.current.slice(0, idx));
      setIsLoading(false);
    }
  };

  const handleApplyCode = (code: string, filePath: string, language: string) => {
    postMessage({ type: 'applyCode', code, filePath, language });
  };

  const handleRequestDiff = (code: string, filePath: string, language: string) => {
    postMessage({ type: 'requestDiff', code, filePath, language });
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [inputText]);

  useEffect(() => {
    if (editTextareaRef.current) {
      editTextareaRef.current.style.height = 'auto';
      editTextareaRef.current.style.height = Math.min(editTextareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [editingContent]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--vscode-sideBar-background)', color: 'var(--vscode-foreground)' }}>
      {activeDiff ? (
        <DiffViewer
          filePath={activeDiff.filePath}
          originalContent={activeDiff.originalContent}
          newContent={activeDiff.newContent}
          onCancel={() => setActiveDiff(null)}
          onApply={() => {
            postMessage({ type: 'applyCode', code: activeDiff.code, filePath: activeDiff.filePath, language: activeDiff.language });
            setActiveDiff(null);
          }}
        />
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 min-h-0">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full opacity-40 select-none pt-10">
                <div className="text-2xl mb-2">⬡</div>
                <div className="text-sm font-semibold">Andor</div>
                <div className="text-xs mt-1">Advanced AI coding agent</div>
                <div className="text-[10px] mt-3 text-center max-w-[160px] leading-relaxed">
                  Ask me to read, debug, refactor, or build anything in your codebase
                </div>
              </div>
            )}

            {/* Agent Dashboard */}
            {agentDashboard && agentDashboard.agents.length > 0 && (
              <AgentDashboard
                state={agentDashboard}
                onStop={() => postMessage({ type: 'stopAgents' })}
              />
            )}

            {messages.map((msg, idx) => (
              <div key={msg.id} className={`group relative ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[88%]">
                    {/* Context file badges */}
                    {msg.contextFiles && msg.contextFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1 justify-end">
                        {msg.contextFiles.map((f, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded opacity-50" style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>
                            {f}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* User message bubble */}
                    {editingMessageId === msg.id ? (
                      <div className="rounded-lg p-2" style={{ border: '1px solid var(--vscode-focusBorder)', background: 'var(--vscode-input-background)' }}>
                        <textarea
                          ref={editTextareaRef}
                          value={editingContent}
                          onChange={e => setEditingContent(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave(msg.id); } if (e.key === 'Escape') handleEditCancel(); }}
                          className="w-full resize-none text-sm outline-none bg-transparent"
                          style={{ color: 'var(--vscode-input-foreground)', minHeight: '40px' }}
                        />
                        <div className="flex gap-1 mt-1.5 justify-end">
                          <button onClick={() => handleEditSave(msg.id)} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}>
                            Resend
                          </button>
                          <button onClick={handleEditCancel} className="text-[10px] px-2 py-0.5 rounded opacity-60" style={{ background: 'var(--vscode-input-background)' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg px-3 py-2 text-sm relative" style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}>
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                        {msg.images && msg.images.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {msg.images.map((img, i) => (
                              <img key={i} src={img} alt="" className="w-14 h-14 rounded object-cover" />
                            ))}
                          </div>
                        )}
                        {/* Hover actions */}
                        <div className="absolute -top-5 right-0 hidden group-hover:flex gap-1">
                          <button
                            onClick={() => handleEditMessage(msg)}
                            className="text-[9px] px-1.5 py-0.5 rounded opacity-70 hover:opacity-100"
                            style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-foreground)' }}
                            title="Edit & resend"
                          >
                            ✏
                          </button>
                          <button
                            onClick={() => handleRevertBefore(msg.id)}
                            className="text-[9px] px-1.5 py-0.5 rounded opacity-70 hover:opacity-100"
                            style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-foreground)' }}
                            title="Revert to before this message"
                          >
                            ↩
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Assistant message */
                  <div className="max-w-full w-full">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-4 h-4 rounded flex items-center justify-center text-[8px]" style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}>⬡</div>
                      <span className="text-[9px] font-semibold opacity-50">Andor</span>
                      {msg.model && <span className="text-[9px] opacity-30">· {msg.model}</span>}
                      {chatMode === 'agent' && <span className="text-[8px] opacity-20">agent</span>}
                      {msg.isStreaming && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--vscode-button-background)' }} />
                      )}
                    </div>
                    <div className="text-sm leading-relaxed">
                      {(msg.content ?? '').startsWith('Error:') ? (
                        <div className="px-3 py-2 rounded text-sm" style={{ background: 'var(--vscode-inputValidation-errorBackground, #5a1d1d)', color: 'var(--vscode-inputValidation-errorForeground, #f48771)' }}>
                          <p className="font-semibold text-xs mb-1">Error</p>
                          <p className="text-xs">{(msg.content ?? '').slice(7)}</p>
                        </div>
                      ) : msg.content ? (
                        renderAssistantContent(msg.content, msg.isStreaming || false, handleApplyCode, handleRequestDiff, postMessage)
                      ) : msg.isStreaming ? (
                        <div className="flex items-center gap-2 opacity-40">
                          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs">{thinkingMode ? 'Thinking deeply...' : 'Working...'}</span>
                        </div>
                      ) : null}
                    </div>
                    {/* Task complete indicator */}
                    {!msg.isStreaming && idx === messages.length - 1 && taskComplete && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'var(--vscode-testing-iconPassed, #4caf50)22', color: 'var(--vscode-testing-iconPassed, #4caf50)' }}>
                          ✓ Task complete
                        </span>
                        <button
                          onClick={handleContinue}
                          className="text-[9px] px-2 py-0.5 rounded opacity-70 hover:opacity-100"
                          style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-foreground)' }}
                        >
                          Continue →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Command approval dialog */}
            {pendingCommandApproval && (
              <CommandApproval
                request={pendingCommandApproval}
                postMessage={postMessage}
                onDismiss={onDismissCommandApproval}
              />
            )}

            {/* Thinking indicator */}
            {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
              <div className="flex items-center gap-2 py-2 opacity-50">
                <div className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--vscode-button-background)', animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--vscode-button-background)', animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--vscode-button-background)', animationDelay: '300ms' }} />
                </div>
                <span className="text-xs">Andor is working...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Context files bar */}
          {contextFiles.length > 0 && (
            <div className="flex-shrink-0 px-3 py-1.5" style={{ borderTop: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-input-background)' }}>
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[9px] opacity-50 mr-0.5">context:</span>
                {contextFiles.map((f, i) => (
                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }} title={f.reason}>
                    {f.relativePath}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="flex-shrink-0 px-3 py-2 relative" style={{ borderTop: '1px solid var(--vscode-panel-border)' }}>
            {/* Attached files display */}
            {attachedFiles.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mb-1.5 pb-1.5" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
                <span className="text-[9px] opacity-40">Attached:</span>
                {attachedFiles.map((f) => (
                  <span
                    key={f.path}
                    className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}
                  >
                    {f.isDirectory ? '📁' : '📄'} {f.name}
                    <button
                      onClick={() => handleRemoveAttachedFile(f.path)}
                      className="opacity-60 hover:opacity-100 ml-0.5"
                      title="Remove"
                    >×</button>
                  </span>
                ))}
              </div>
            )}

            <ImageUploader images={uploadedImages} onImagesChange={setUploadedImages} />

            {/* File picker popup */}
            {showFilePicker && (
              <div className="absolute bottom-full left-0 right-0 px-3 pb-1 z-50">
                <FilePicker
                  query={filePickerQuery}
                  files={projectFiles}
                  visible={showFilePicker}
                  onSelect={handleFileSelect}
                  onDismiss={() => { setShowFilePicker(false); setFilePickerQuery(''); textareaRef.current?.focus(); }}
                  mode={filePickerMode}
                />
              </div>
            )}

            {/* Web search results display */}
            {webSearchResults.length > 0 && (
              <div className="mb-1.5">
                <WebSearchResults
                  results={webSearchResults}
                  query={webSearchQuery}
                  onFetchUrl={(url) => postMessage({ type: 'fetchUrl', url })}
                />
              </div>
            )}

            <div className="flex gap-1.5 mt-1 items-end">
              {/* Add files button */}
              <button
                onClick={() => {
                  setFilePickerMode('button');
                  setFilePickerQuery('');
                  setShowFilePicker(v => !v);
                  if (!projectFiles.length) {
                    postMessage({ type: 'listProjectFiles' });
                  }
                }}
                className="px-2 py-2 rounded text-sm transition-opacity hover:opacity-100 opacity-60 flex-shrink-0"
                style={{
                  backgroundColor: 'var(--vscode-input-background)',
                  color: 'var(--vscode-foreground)',
                  border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
                }}
                title="Add files or folders (or type / in chat)"
              >
                📎
              </button>
              {/* Web search button */}
              <button
                onClick={handleWebSearch}
                disabled={!inputText.trim()}
                className="px-2 py-2 rounded text-sm transition-opacity hover:opacity-100 opacity-60 disabled:opacity-20 flex-shrink-0"
                style={{
                  backgroundColor: 'var(--vscode-input-background)',
                  color: 'var(--vscode-foreground)',
                  border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
                }}
                title="Search the web for current input text"
              >
                🔍
              </button>
              {/* Prompt improver button */}
              <PromptImprover
                inputText={inputText}
                onImproved={(text) => setInputText(text)}
                postMessage={postMessage}
                selectedModel={selectedModel}
                disabled={isLoading}
              />
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={isLoading ? 'Andor is working...' : 'Ask anything... (type / to add files)'}
                rows={1}
                className="flex-1 resize-none rounded px-2.5 py-2 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--vscode-input-background)',
                  color: 'var(--vscode-input-foreground)',
                  border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
                  lineHeight: '1.4',
                }}
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !inputText.trim()}
                className="px-3 py-2 rounded text-sm font-medium transition-all disabled:opacity-30 flex-shrink-0"
                style={{
                  backgroundColor: 'var(--vscode-button-background)',
                  color: 'var(--vscode-button-foreground)',
                  minWidth: '36px',
                }}
                title="Send (Enter)"
              >
                {isLoading ? (
                  <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                ) : '↑'}
              </button>
            </div>
            <div className="text-[9px] opacity-30 mt-1 px-0.5">Enter to send · Shift+Enter for newline · / to add files</div>
          </div>

          <style>{`
            .inline-code {
              background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.1));
              padding: 1px 4px;
              border-radius: 3px;
              font-family: var(--vscode-editor-font-family);
              font-size: 0.85em;
            }
          `}</style>
        </>
      )}
    </div>
  );
}
