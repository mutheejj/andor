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
  type: 'sendMessage' | 'applyCode' | 'requestDiff' | 'clearHistory' | 'getContext' | 'openExternal' | 'startPuterAuth' | 'logout' | 'runTerminal' | 'writeFile' | 'readFile'
    | 'getProviders' | 'setApiKey' | 'deleteApiKey' | 'testProvider' | 'getModels' | 'selectModel'
    | 'approveCommand' | 'denyCommand' | 'alwaysAllowCommand'
    | 'openSettings' | 'streamWithProvider';
  text?: string;
  model?: string;
  images?: string[];
  code?: string;
  filePath?: string;
  language?: string;
  url?: string;
  command?: string;
  content?: string;
  providerId?: string;
  apiKey?: string;
  commandId?: string;
  pattern?: string;
  showPaid?: boolean;
  systemPrompt?: string;
  history?: Array<{ role: string; content: string }>;
}

export interface ProviderInfo {
  id: string;
  name: string;
  hasKey: boolean;
  modelCount: number;
  status: 'configured' | 'unconfigured' | 'untested';
}

export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  contextWindow: number;
  free: boolean;
  bestFor: string;
  tier: 'fast' | 'balanced' | 'powerful';
}

export interface CommandApprovalRequest {
  commandId: string;
  command: string;
  description: string;
}

export interface ExtensionToWebviewMessage {
  type: 'response' | 'responseChunk' | 'responseDone' | 'context' | 'diagnostics' | 'error' | 'diffResult' | 'historyCleared' | 'puterToken' | 'terminalResult' | 'fileWritten' | 'fileContent'
    | 'providers' | 'models' | 'providerTestResult' | 'apiKeyStored' | 'apiKeyDeleted'
    | 'commandApproval' | 'commandResult'
    | 'streamChunk' | 'streamDone' | 'streamError';
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
  providers?: ProviderInfo[];
  models?: ModelInfo[];
  providerId?: string;
  success?: boolean;
  commandApproval?: CommandApprovalRequest;
  commandId?: string;
  model?: string;
  provider?: string;
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

export interface AllowlistEntry {
  pattern: string;
  addedAt: string;
  addedBy: 'user' | 'auto';
}

export interface AllowlistFile {
  version: string;
  patterns: AllowlistEntry[];
}
