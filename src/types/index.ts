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
    | 'openSettings' | 'streamWithProvider'
    | 'getIndexingStatus' | 'attachFiles' | 'attachFolder' | 'searchFiles' | 'getFileContent'
    | 'getMemory' | 'clearMemory'
    | 'listProjectFiles'
    | 'webSearch' | 'fetchUrl'
    | 'improvePrompt' | 'stopAgents'
    | 'setServiceKey' | 'getServiceKeys' | 'deleteServiceKey'
    | 'reindexWorkspace' | 'getIndexedFiles'
    | 'getSettingsState' | 'saveSettingsState';
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
  filePaths?: string[];
  folderPath?: string;
  query?: string;
  apiKey?: string;
  commandId?: string;
  pattern?: string;
  showPaid?: boolean;
  systemPrompt?: string;
  chatMode?: string;
  history?: Array<{ role: string; content: string }>;
  settingsState?: SettingsState;
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
  modelSpec?: string;
}

export interface ProviderProfile {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  supportsImages: boolean;
  supportsPromptCaching: boolean;
  inputPrice: number;
  outputPrice: number;
  maxTokens: number;
  contextWindow: number;
  reasoningParameters: boolean;
  sendMaxTokens: boolean;
  enableStreaming: boolean;
  customHeaders: Array<{ key: string; value: string }>;
}

export interface IndexingSettings {
  indexingEnabled: boolean;
  searchScoreThreshold: number;
  maximumSearchResults: number;
  embeddingBatchSize: number;
  scannerMaxBatchRetries: number;
}

export interface SettingsState {
  profiles: ProviderProfile[];
  activeProfileId: string;
  indexing: IndexingSettings;
}

export interface CommandApprovalRequest {
  commandId: string;
  command: string;
  description: string;
}

export interface IndexingStatusInfo {
  state: 'idle' | 'indexing' | 'ready' | 'error';
  progress: number;
  totalFiles: number;
  indexedFiles: number;
  currentFile?: string;
  message: string;
}

export interface AttachedFile {
  name: string;
  path: string;
  content: string;
  language: string;
  size: number;
}

export interface FileSearchResult {
  path: string;
  relativePath: string;
  name: string;
  language: string;
}

export interface ExtensionToWebviewMessage {
  type: 'response' | 'responseChunk' | 'responseDone' | 'context' | 'diagnostics' | 'error' | 'diffResult' | 'historyCleared' | 'puterToken' | 'terminalResult' | 'fileWritten' | 'fileContent'
  | 'providers' | 'models' | 'providerTestResult' | 'apiKeyStored' | 'apiKeyDeleted'
  | 'commandApproval' | 'commandResult'
  | 'streamChunk' | 'streamDone' | 'streamError'
  | 'taskSteps' | 'taskComplete'
  | 'indexingStatus' | 'attachedFiles' | 'fileSearchResults'
  | 'memoryData' | 'projectFiles'
  | 'webSearchResults' | 'urlContent'
  | 'agentDashboardUpdate' | 'improvedPrompt'
  | 'serviceKeys' | 'indexedFiles' | 'settingsState';
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
  steps?: unknown[];
  indexingStatus?: IndexingStatusInfo;
  attachedFiles?: AttachedFile[];
  searchResults?: FileSearchResult[];
  memory?: unknown;
  settingsState?: SettingsState;
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
