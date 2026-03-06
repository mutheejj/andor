import * as vscode from 'vscode';

export interface FileInfo {
  path: string;
  relativePath: string;
  language: string;
  size: number;
  lastModified: number;
}

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'enum';
  filePath: string;
  line: number;
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  filePath: string;
}

export interface WorkspaceIndex {
  files: Map<string, FileInfo>;
  symbols: Map<string, SymbolInfo[]>;
  imports: Map<string, ImportInfo[]>;
  exports: Map<string, string[]>;
  recentFiles: string[];
}

export interface DiagnosticEntry {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: string;
  images?: string[];
  contextFiles?: string[];
}

export interface WebviewToExtensionMessage {
  type: 'sendMessage' | 'applyCode' | 'requestDiff' | 'clearHistory' | 'getContext' | 'openExternal' | 'startPuterAuth' | 'logout' | 'runTerminal' | 'writeFile' | 'readFile';
  text?: string;
  model?: string;
  images?: string[];
  code?: string;
  filePath?: string;
  language?: string;
  url?: string;
  command?: string;
  content?: string;
}

export interface ExtensionToWebviewMessage {
  type: 'response' | 'responseChunk' | 'responseDone' | 'context' | 'diagnostics' | 'error' | 'diffResult' | 'historyCleared' | 'puterToken' | 'terminalResult' | 'fileWritten' | 'fileContent';
  text?: string;
  files?: ContextFile[];
  diagnostics?: DiagnosticEntry[];
  diff?: DiffResult;
  error?: string;
  token?: string;
  output?: string;
  exitCode?: number;
  filePath?: string;
  content?: string;
}

export interface ContextFile {
  path: string;
  relativePath: string;
  content: string;
  reason: string;
}

export interface DiffResult {
  filePath: string;
  originalContent: string;
  newContent: string;
}

export type SupportedModel =
  | 'claude-sonnet-4'
  | 'claude-opus-4'
  | 'claude-haiku-4'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4-1'
  | 'o3-mini'
  | 'gemini-2-5-pro'
  | 'gemini-2-5-flash'
  | 'deepseek-v3'
  | 'deepseek-r1'
  | 'llama-4-maverick'
  | 'llama-4-scout'
  | 'mistral-large';

export interface ModelOption {
  id: SupportedModel;
  label: string;
  tag: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'claude-sonnet-4', label: 'Claude Sonnet 4', tag: 'Recommended' },
  { id: 'claude-opus-4', label: 'Claude Opus 4', tag: 'Most capable' },
  { id: 'claude-haiku-4', label: 'Claude Haiku 4', tag: 'Fast & efficient' },
  { id: 'gpt-4o', label: 'GPT-4o', tag: 'Great for code' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', tag: 'Fast' },
  { id: 'gpt-4-1', label: 'GPT-4.1', tag: 'Latest GPT' },
  { id: 'o3-mini', label: 'o3-mini', tag: 'Reasoning' },
  { id: 'gemini-2-5-pro', label: 'Gemini 2.5 Pro', tag: 'Recommended' },
  { id: 'gemini-2-5-flash', label: 'Gemini 2.5 Flash', tag: 'Fast' },
  { id: 'deepseek-v3', label: 'DeepSeek V3', tag: 'Open source' },
  { id: 'deepseek-r1', label: 'DeepSeek R1', tag: 'Reasoning' },
  { id: 'llama-4-maverick', label: 'Llama 4 Maverick', tag: 'Open source' },
  { id: 'llama-4-scout', label: 'Llama 4 Scout', tag: 'Open source' },
  { id: 'mistral-large', label: 'Mistral Large', tag: 'Open source' },
];
