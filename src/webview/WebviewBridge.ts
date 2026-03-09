import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { WebviewToExtensionMessage, ExtensionToWebviewMessage, DiffResult, AllowlistFile, ProviderInfo, ModelInfo, SettingsState } from '../types';

import { WorkspaceIndexer } from '../indexer/WorkspaceIndexer';
import { ContextAssembler as OldContextAssembler } from '../indexer/ContextAssembler';
import { DiagnosticsWatcher } from '../indexer/DiagnosticsWatcher';
import { AndorCore } from '../core/AndorCore';
import { PuterAuthServer } from '../auth/PuterAuthServer';
import { ProviderRegistry, isPuterModel } from '../providers';
import { AIMessage, AIProvider, ProviderModel } from '../providers/base';
import { LearningService } from '../learning';
import { WebSearchService } from '../services/WebSearchService';
import { AgentOrchestrator } from '../agents/AgentOrchestrator';
import { SessionContinuity } from '../agents/SessionContinuity';
import { TerminalParser } from '../terminal/TerminalParser';
import { ImportGraphBuilder } from '../context/ImportGraphBuilder';
import { FileRelevanceScorer } from '../context/FileRelevanceScorer';
import { CloudDetector } from '../context/CloudDetector';

/** Core behavior instructions appended to every system prompt */
const ANDOR_BEHAVIOR_PROMPT = `

[ANDOR CORE BEHAVIOR]
1. HONESTY: Never claim you did something you didn't. If you haven't run a command, don't say "Done" or "Deleted". If unsure, say so and explain what you'd need to verify.
2. CONCISE RESPONSES: Keep explanations short and to the point, like an expert explaining to a junior developer. Focus on WHAT to do and WHY, not lengthy theory.
3. FILE CONTENT: When asked about a file's content, give a brief summary (purpose, key functions, structure) — never dump the entire file content into the chat unless specifically asked for the full code.
4. ACTION FOCUS: Your primary job is writing and updating files, running commands, and making changes. Minimize talk, maximize action.
5. VERIFICATION: After making changes, verify they work. If you write a file, confirm it was written. If you run a command, report the actual output. Never fabricate results.
6. THINKING: When facing complex tasks, think step-by-step before acting. Show your reasoning in <thinking> blocks when the task is non-trivial.
7. FRAMEWORK AWARENESS: Understand and respect the project's framework conventions (React, Express, Django, Next.js, etc). Follow the project's existing patterns.
8. ERROR HANDLING: When errors occur, analyze the root cause deeply before suggesting fixes. Don't guess — read the error, understand it, then fix it.
9. TERMINAL COMMANDS: You CAN run terminal commands. When the user asks to run a command, delete files, install packages, or do anything that requires the terminal, use the runTerminal message type. Examples: npm install, rm -rf, git push, ls, cat, etc.
10. COMMAND APPROVAL: Some commands need user approval (like rm, git push). The system will prompt the user. Don't ask the user if they want to run it — just send the command and the system will handle approval.
`;

const AUTO_ALLOWED = [
  /^git (status|diff|log|branch|show)/,
  /^npm run (build|test|lint|typecheck|compile)/,
  /^tsc(\s|$)/,
  /^echo /,
  /^cat /,
  /^ls /,
  /^pwd$/,
  /^node --version$/,
  /^npm --version$/,
];

const SETTINGS_STATE_KEY = 'andor.settingsState';

const DEFAULT_SETTINGS_STATE: SettingsState = {
  profiles: [
    {
      id: 'llama-3.3-70b',
      name: 'Llama 3.3 70B',
      provider: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'nvidia::meta/llama-3.3-70b-instruct',
      supportsImages: false,
      supportsPromptCaching: false,
      inputPrice: 0,
      outputPrice: 0,
      maxTokens: -1,
      contextWindow: 131072,
      reasoningParameters: true,
      sendMaxTokens: false,
      enableStreaming: true,
      customHeaders: [],
    },
    {
      id: 'llama-vision',
      name: 'Llama 3.2 Vision',
      provider: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'nvidia::meta/llama-3.2-90b-vision-instruct',
      supportsImages: true,
      supportsPromptCaching: false,
      inputPrice: 0,
      outputPrice: 0,
      maxTokens: -1,
      contextWindow: 128000,
      reasoningParameters: false,
      sendMaxTokens: false,
      enableStreaming: true,
      customHeaders: [],
    },
    {
      id: 'qwen-coder',
      name: 'Qwen 2.5 Coder',
      provider: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'nvidia::qwen/qwen2.5-coder-32b-instruct',
      supportsImages: false,
      supportsPromptCaching: false,
      inputPrice: 0,
      outputPrice: 0,
      maxTokens: -1,
      contextWindow: 131072,
      reasoningParameters: false,
      sendMaxTokens: false,
      enableStreaming: true,
      customHeaders: [],
    },
    {
      id: 'llama-fast',
      name: 'Llama 3.1 8B Fast',
      provider: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'nvidia::meta/llama-3.1-8b-instruct',
      supportsImages: false,
      supportsPromptCaching: false,
      inputPrice: 0,
      outputPrice: 0,
      maxTokens: -1,
      contextWindow: 131072,
      reasoningParameters: false,
      sendMaxTokens: false,
      enableStreaming: true,
      customHeaders: [],
    },
    {
      id: 'deepseek',
      name: 'deepseek',
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openrouter::deepseek/deepseek-chat-v3.1',
      supportsImages: false,
      supportsPromptCaching: false,
      inputPrice: 0,
      outputPrice: 0,
      maxTokens: -1,
      contextWindow: 128000,
      reasoningParameters: false,
      sendMaxTokens: false,
      enableStreaming: true,
      customHeaders: [],
    },
    {
      id: 'vision',
      name: 'vision',
      provider: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'google::gemini-2.0-flash',
      supportsImages: true,
      supportsPromptCaching: false,
      inputPrice: 0,
      outputPrice: 0,
      maxTokens: -1,
      contextWindow: 1048576,
      reasoningParameters: false,
      sendMaxTokens: false,
      enableStreaming: true,
      customHeaders: [],
    },
  ],
  activeProfileId: 'llama-3.3-70b',
  indexing: {
    indexingEnabled: true,
    searchScoreThreshold: 0.3,
    maximumSearchResults: 50,
    embeddingBatchSize: 200,
    scannerMaxBatchRetries: 5,
  },
};

function matchesAllowlist(command: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern === command) { return true; }
    // Glob-style: "npm install *" matches "npm install express"
    if (pattern.endsWith(' *')) {
      const prefix = pattern.slice(0, -1); // "npm install "
      if (command.startsWith(prefix)) { return true; }
    }
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (command.startsWith(prefix)) { return true; }
    }
  }
  return false;
}

function extractPattern(command: string): string {
  // Extract a glob pattern from a command
  // "npm install express cors" → "npm install *"
  // "git commit -m 'msg'" → "git commit *"
  const parts = command.split(' ');
  if (parts.length <= 2) { return command; }
  return parts.slice(0, 2).join(' ') + ' *';
}

export class WebviewBridge {
  private webviewView: vscode.WebviewView | undefined;
  private webviewPanel: vscode.WebviewPanel | undefined;
  private indexer: WorkspaceIndexer;
  private contextAssembler: OldContextAssembler;
  private diagnosticsWatcher: DiagnosticsWatcher;
  private context: vscode.ExtensionContext;
  private authServer: PuterAuthServer;
  private providerRegistry: ProviderRegistry;
  private learningService?: LearningService;
  private orchestrator?: AgentOrchestrator;
  private sessionContinuity?: SessionContinuity;
  private importGraph?: ImportGraphBuilder;
  private relevanceScorer?: FileRelevanceScorer;
  private puterToken: string | null = null;
  private pendingCommands: Map<string, { command: string; resolve: (approved: boolean) => void }> = new Map();
  private andorCore?: AndorCore;

  constructor(
    indexer: WorkspaceIndexer,
    contextAssembler: OldContextAssembler,
    diagnosticsWatcher: DiagnosticsWatcher,
    context: vscode.ExtensionContext,
    authServer: PuterAuthServer,
    providerRegistry: ProviderRegistry,
    learningService?: LearningService,
  ) {
    this.indexer = indexer;
    this.contextAssembler = contextAssembler;
    this.diagnosticsWatcher = diagnosticsWatcher;
    this.context = context;
    this.authServer = authServer;
    this.providerRegistry = providerRegistry;
    this.learningService = learningService;

    // Initialize import graph and relevance scorer
    this.importGraph = new ImportGraphBuilder(indexer);
    this.importGraph.build();
    this.relevanceScorer = new FileRelevanceScorer(indexer, this.importGraph);

    // Initialize agent orchestrator and session continuity
    this.orchestrator = new AgentOrchestrator(providerRegistry);
    this.orchestrator.setDashboardCallback((state) => {
      this.webviewView?.webview.postMessage({ type: 'agentDashboardUpdate', state });
    });
    this.sessionContinuity = new SessionContinuity(providerRegistry);

    this.diagnosticsWatcher.onChange((diagnostics) => {
      this.postMessage({ type: 'diagnostics', diagnostics });
    });

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      const globalStoragePath = context.globalStorageUri.fsPath;
      this.andorCore = new AndorCore(workspaceRoot, globalStoragePath);
      this.andorCore.setOnStepUpdateCallback((steps) => {
        this.postMessage({ type: 'taskSteps', steps });
      });
      this.andorCore.setOnTaskCompleteCallback((success) => {
        this.postMessage({ type: 'taskComplete', success });
      });
      this.andorCore.setOnIndexingStatusCallback((status) => {
        this.postMessage({ type: 'indexingStatus', indexingStatus: status });
      });
      this.andorCore.initialize().catch(err => {
        console.error('[Andor] Core initialization failed:', err);
      });
    }

    // Load and apply stored service keys (Brave, Vision, etc.)
    this.loadAndApplyServiceKeys().catch(() => { /* ignore */ });
  }

  setWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    webviewView.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
      this.handleMessage(message);
    });
    
    // Send stored token to webview if available
    if (this.puterToken) {
      console.log('[Andor] Sending stored token to webview');
      this.postMessage({ type: 'puterToken', token: this.puterToken });
    }
  }

  setWebviewPanel(webviewPanel: vscode.WebviewPanel): void {
    this.webviewPanel = webviewPanel;
    webviewPanel.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
      this.handleMessage(message);
    });

    if (this.puterToken) {
      this.postMessage({ type: 'puterToken', token: this.puterToken });
    }
  }

  clearWebviewPanel(webviewPanel?: vscode.WebviewPanel): void {
    if (!webviewPanel || this.webviewPanel === webviewPanel) {
      this.webviewPanel = undefined;
    }
  }

  setPuterToken(token: string): void {
    this.puterToken = token;
    // If webview is already loaded, send token immediately
    if (this.webviewView) {
      console.log('[Andor] Sending token to active webview');
      this.postMessage({ type: 'puterToken', token });
    }
  }

  postMessage(message: ExtensionToWebviewMessage): void {
    this.webviewView?.webview.postMessage(message);
    this.webviewPanel?.webview.postMessage(message);
  }

  private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    console.log('[Andor] Received message:', message.type, message);
    switch (message.type) {
      case 'sendMessage':
        console.log('[Andor] Handling sendMessage');
        await this.handleSendMessage(message);
        break;
      case 'applyCode':
        console.log('[Andor] Handling applyCode');
        await this.handleApplyCode(message);
        break;
      case 'requestDiff':
        console.log('[Andor] Handling requestDiff');
        await this.handleRequestDiff(message);
        break;
      case 'clearHistory':
        console.log('[Andor] Handling clearHistory');
        this.postMessage({ type: 'historyCleared' });
        break;
      case 'getContext':
        console.log('[Andor] Handling getContext');
        this.handleGetContext(message.text || '');
        break;
      case 'openExternal':
        console.log('[Andor] Handling openExternal:', message.url);
        if (message.url) {
          const targetUri = vscode.Uri.parse(message.url);
          if (targetUri.scheme === 'command') {
            await vscode.commands.executeCommand(targetUri.path || targetUri.fsPath || message.url.replace(/^command:/, ''));
          } else {
            vscode.env.openExternal(targetUri);
          }
        }
        break;
      case 'startPuterAuth':
        console.log('[Andor] Handling startPuterAuth');
        await this.handleStartPuterAuth();
        break;
      case 'logout':
        console.log('[Andor] Handling logout');
        await this.handleLogout();
        break;
      case 'runTerminal':
        console.log('[Andor] Handling runTerminal');
        await this.handleRunTerminal(message);
        break;
      case 'writeFile':
        console.log('[Andor] Handling writeFile');
        await this.handleWriteFile(message);
        break;
      case 'readFile':
        console.log('[Andor] Handling readFile');
        await this.handleReadFile(message);
        break;
      case 'getProviders':
        console.log('[Andor] Handling getProviders');
        await this.handleGetProviders();
        break;
      case 'setApiKey':
        console.log('[Andor] Handling setApiKey');
        await this.handleSetApiKey(message);
        break;
      case 'deleteApiKey':
        console.log('[Andor] Handling deleteApiKey');
        await this.handleDeleteApiKey(message);
        break;
      case 'testProvider':
        console.log('[Andor] Handling testProvider');
        await this.handleTestProvider(message);
        break;
      case 'getModels':
        console.log('[Andor] Handling getModels');
        await this.handleGetModels(message);
        break;
      case 'approveCommand':
        console.log('[Andor] Handling approveCommand');
        this.handleApproveCommand(message);
        break;
      case 'denyCommand':
        console.log('[Andor] Handling denyCommand');
        this.handleDenyCommand(message);
        break;
      case 'alwaysAllowCommand':
        console.log('[Andor] Handling alwaysAllowCommand');
        await this.handleAlwaysAllowCommand(message);
        break;
      case 'streamWithProvider':
        console.log('[Andor] Handling streamWithProvider');
        await this.handleStreamWithProvider(message);
        break;
      case 'getIndexingStatus':
        this.handleGetIndexingStatus();
        break;
      case 'attachFiles':
        await this.handleAttachFiles(message);
        break;
      case 'attachFolder':
        await this.handleAttachFolder(message);
        break;
      case 'searchFiles':
        await this.handleSearchFiles(message);
        break;
      case 'getFileContent':
        await this.handleGetFileContent(message);
        break;
      case 'getMemory':
        await this.handleGetMemory();
        break;
      case 'clearMemory':
        await this.handleClearMemory();
        break;
      case 'listProjectFiles':
        this.handleListProjectFiles();
        break;
      case 'webSearch':
        await this.handleWebSearch(message);
        break;
      case 'fetchUrl':
        await this.handleFetchUrl(message);
        break;
      case 'improvePrompt':
        await this.handleImprovePrompt(message);
        break;
      case 'stopAgents':
        this.handleStopAgents();
        break;
      case 'setServiceKey':
        await this.handleSetServiceKey(message);
        break;
      case 'getServiceKeys':
        await this.handleGetServiceKeys();
        break;
      case 'deleteServiceKey':
        await this.handleDeleteServiceKey(message);
        break;
      case 'reindexWorkspace':
        await this.handleReindexWorkspace();
        break;
      case 'getIndexedFiles':
        await this.handleGetIndexedFiles();
        break;
      case 'getSettingsState':
        this.handleGetSettingsState();
        break;
      case 'saveSettingsState':
        await this.handleSaveSettingsState(message);
        break;
      default:
        console.log('[Andor] Unknown message type:', message.type);
    }
  }

  private getSettingsState(): SettingsState {
    return this.context.globalState.get<SettingsState>(SETTINGS_STATE_KEY, DEFAULT_SETTINGS_STATE);
  }

  private handleGetSettingsState(): void {
    this.postMessage({ type: 'settingsState', settingsState: this.getSettingsState() });
  }

  private async handleSaveSettingsState(message: WebviewToExtensionMessage): Promise<void> {
    if (!message.settingsState) {
      return;
    }
    await this.context.globalState.update(SETTINGS_STATE_KEY, message.settingsState);
    this.postMessage({ type: 'settingsState', settingsState: this.getSettingsState() });
  }

  private handleGetIndexingStatus(): void {
    if (this.andorCore) {
      this.postMessage({ type: 'indexingStatus', indexingStatus: this.andorCore.getIndexingStatus() });
    }
  }

  private async handleAttachFiles(message: WebviewToExtensionMessage): Promise<void> {
    const filePaths = message.filePaths || [];
    const workspaceRoot = this.indexer.getWorkspaceRoot() || '';
    const attachedFiles: Array<{ name: string; path: string; content: string; language: string; size: number }> = [];

    for (const fp of filePaths) {
      try {
        const fullPath = path.isAbsolute(fp) ? fp : path.join(workspaceRoot, fp);
        
        // Skip directories - only attach files
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          console.log(`[Andor] Skipping directory in attachFiles: ${fp}`);
          continue;
        }
        
        const uri = vscode.Uri.file(fullPath);
        const bytes = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(bytes).toString('utf-8');
        const ext = path.extname(fullPath).replace('.', '');
        attachedFiles.push({
          name: path.basename(fullPath),
          path: fullPath,
          content: content.length > 100000 ? content.substring(0, 100000) + '\n... (truncated)' : content,
          language: ext || 'plaintext',
          size: bytes.byteLength,
        });
      } catch (err) {
        console.error(`[Andor] Failed to read file ${fp}:`, err);
      }
    }

    this.postMessage({ type: 'attachedFiles', attachedFiles });
  }

  private async handleAttachFolder(message: WebviewToExtensionMessage): Promise<void> {
    const folderPath = message.folderPath;
    if (!folderPath) return;

    const workspaceRoot = this.indexer.getWorkspaceRoot() || '';
    const fullPath = path.isAbsolute(folderPath) ? folderPath : path.join(workspaceRoot, folderPath);

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      const filePaths = entries
        .filter(e => e.isFile())
        .slice(0, 50)
        .map(e => path.join(fullPath, e.name));
      
      await this.handleAttachFiles({ ...message, type: 'attachFiles', filePaths });
    } catch (err) {
      console.error(`[Andor] Failed to read folder ${folderPath}:`, err);
    }
  }

  private async handleSearchFiles(message: WebviewToExtensionMessage): Promise<void> {
    const query = (message.query || '').toLowerCase();
    if (!query) return;

    const workspaceRoot = this.indexer.getWorkspaceRoot() || '';
    const allFiles = this.indexer.getAllFiles?.() || [];
    
    const results = allFiles
      .filter((f: { relativePath: string }) => f.relativePath.toLowerCase().includes(query))
      .slice(0, 50)
      .map((f: { path: string; relativePath: string; language: string }) => ({
        path: f.path,
        relativePath: f.relativePath,
        name: path.basename(f.path),
        language: f.language || path.extname(f.path).replace('.', '') || 'plaintext',
      }));

    this.postMessage({ type: 'fileSearchResults', searchResults: results });
  }

  private async handleGetFileContent(message: WebviewToExtensionMessage): Promise<void> {
    const filePath = message.filePath;
    if (!filePath) return;

    try {
      const uri = vscode.Uri.file(filePath);
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString('utf-8');
      this.postMessage({ type: 'fileContent', filePath, content });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'error', error: `Failed to read file: ${errorMsg}` });
    }
  }

  private handleListProjectFiles(): void {
    const workspaceRoot = this.indexer.getWorkspaceRoot();
    if (!workspaceRoot) return;

    const IGNORE_DIRS = new Set([
      'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out',
      '.cache', '.vscode', '__pycache__', '.tox', 'venv', '.env',
      'coverage', '.turbo', '.svelte-kit', 'target', 'vendor',
    ]);
    const IGNORE_FILES = new Set(['.DS_Store', 'Thumbs.db']);

    const EXT_LANG: Record<string, string> = {
      ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
      py: 'python', go: 'go', rs: 'rust', java: 'java', cs: 'csharp',
      php: 'php', rb: 'ruby', html: 'html', css: 'css', scss: 'scss',
      json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown', txt: 'plaintext',
      vue: 'vue', svelte: 'svelte', sh: 'shell', bash: 'shell',
      sql: 'sql', xml: 'xml', toml: 'toml', env: 'env',
    };

    const results: Array<{
      path: string;
      relativePath: string;
      name: string;
      isDirectory: boolean;
      language: string;
    }> = [];

    const walk = (dir: string, depth: number) => {
      if (depth > 6 || results.length > 2000) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (IGNORE_FILES.has(entry.name)) continue;
          if (entry.name.startsWith('.') && entry.isDirectory()) continue;

          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(workspaceRoot, fullPath);

          if (entry.isDirectory()) {
            if (IGNORE_DIRS.has(entry.name)) continue;
            results.push({
              path: fullPath,
              relativePath: relPath,
              name: entry.name,
              isDirectory: true,
              language: 'directory',
            });
            walk(fullPath, depth + 1);
          } else {
            const ext = entry.name.split('.').pop()?.toLowerCase() || '';
            results.push({
              path: fullPath,
              relativePath: relPath,
              name: entry.name,
              isDirectory: false,
              language: EXT_LANG[ext] || 'plaintext',
            });
          }
        }
      } catch {
        // Permission denied or other error
      }
    };

    walk(workspaceRoot, 0);

    // Send directly via webview — bypasses typed postMessage since projectFiles has custom shape
    this.webviewView?.webview.postMessage({ type: 'projectFiles', files: results });
  }

  private async handleWebSearch(message: WebviewToExtensionMessage): Promise<void> {
    const query = message.text || '';
    if (!query) return;

    try {
      const results = await WebSearchService.search(query, 8);
      const formatted = WebSearchService.formatForContext(results);
      this.webviewView?.webview.postMessage({
        type: 'webSearchResults',
        text: formatted,
        results,
        query,
      });
    } catch (err) {
      console.error('[Andor WebSearch] Error:', err);
      this.webviewView?.webview.postMessage({
        type: 'webSearchResults',
        text: 'Web search failed.',
        results: [],
        query,
      });
    }
  }

  private async handleFetchUrl(message: WebviewToExtensionMessage): Promise<void> {
    const url = message.url || '';
    if (!url) return;

    try {
      const page = await WebSearchService.fetchPageFull(url);
      this.webviewView?.webview.postMessage({
        type: 'urlContent',
        url: page.url,
        content: page.text,
        title: page.title,
        images: page.images.slice(0, 30),
        links: page.links.slice(0, 50),
        cssFiles: page.cssFiles,
        jsFiles: page.jsFiles,
        meta: page.meta,
      });
    } catch (err) {
      console.error('[Andor] Fetch URL failed:', err);
      // Try simple fallback
      try {
        const content = await WebSearchService.fetchPageContent(url);
        this.webviewView?.webview.postMessage({ type: 'urlContent', url, content });
      } catch {
        this.webviewView?.webview.postMessage({ type: 'urlContent', url, content: 'Failed to fetch URL content.' });
      }
    }
  }

  private async handleImprovePrompt(message: WebviewToExtensionMessage): Promise<void> {
    const text = message.text?.trim();
    if (!text) return;

    const improveSystemPrompt = `You are a prompt engineer for an AI coding agent.
Improve the following user message to be more specific, actionable, and effective for a coding agent that can read files, write code, and run terminal commands.

Rules:
- Keep the original intent exactly
- Add specific file/folder hints if implied
- Add verification step (run tests, check errors)
- Add "show diff" or "explain changes" at the end
- Make it 2-4 sentences max
- Do NOT add unnecessary complexity
- Sound natural, not robotic

Original message: "${text}"

Return ONLY the improved prompt, nothing else.`;

    const modelToUse = message.model || await this.findFastModel();
    const targetPost = (payload: { type: 'improvedPrompt'; text: string }) => {
      this.postMessage(payload);
    };

    try {
      const response = await this.providerRegistry.call(
        [{ role: 'user', content: improveSystemPrompt }],
        modelToUse,
      );
      const improved = response.content.trim();
      if (improved) {
        targetPost({
          type: 'improvedPrompt',
          text: improved,
        });
      }
    } catch (err) {
      console.error('[Andor] Improve prompt error:', err);
    }
  }

  private handleStopAgents(): void {
    if (this.orchestrator) {
      this.orchestrator.stopAll();
      console.log('[Andor] All agents stopped by user');
    }
  }

  // === SERVICE KEY HANDLERS (Brave Search, Vision, etc.) ===
  private static readonly SERVICE_KEY_PREFIX = 'serviceKey_';

  private async handleSetServiceKey(message: WebviewToExtensionMessage): Promise<void> {
    const { providerId, apiKey } = message;
    if (!providerId || !apiKey) return;
    const storageKey = WebviewBridge.SERVICE_KEY_PREFIX + providerId;
    await this.context.secrets.store(storageKey, apiKey);

    // Apply key immediately to the right service
    if (providerId === 'brave') {
      WebSearchService.setBraveApiKey(apiKey);
    }

    this.webviewView?.webview.postMessage({ type: 'serviceKeys', keys: await this.loadServiceKeys() });
  }

  private async handleDeleteServiceKey(message: WebviewToExtensionMessage): Promise<void> {
    const { providerId } = message;
    if (!providerId) return;
    const storageKey = WebviewBridge.SERVICE_KEY_PREFIX + providerId;
    await this.context.secrets.delete(storageKey);
    this.webviewView?.webview.postMessage({ type: 'serviceKeys', keys: await this.loadServiceKeys() });
  }

  private async handleGetServiceKeys(): Promise<void> {
    const keys = await this.loadServiceKeys();
    this.webviewView?.webview.postMessage({ type: 'serviceKeys', keys });
  }

  private async loadServiceKeys(): Promise<Record<string, boolean>> {
    const services = ['brave', 'vision'];
    const result: Record<string, boolean> = {};
    for (const svc of services) {
      const val = await this.context.secrets.get(WebviewBridge.SERVICE_KEY_PREFIX + svc);
      result[svc] = !!val;
    }
    return result;
  }

  async loadAndApplyServiceKeys(): Promise<void> {
    const braveKey = await this.context.secrets.get(WebviewBridge.SERVICE_KEY_PREFIX + 'brave');
    if (braveKey) {
      WebSearchService.setBraveApiKey(braveKey);
    }
  }

  // === WORKSPACE REINDEX ===
  private async handleReindexWorkspace(): Promise<void> {
    const workspaceRoot = this.indexer.getWorkspaceRoot();
    if (!workspaceRoot) return;
    try {
      this.postMessage({ type: 'indexingStatus', indexingStatus: { state: 'indexing', progress: 0, totalFiles: 0, indexedFiles: 0, message: 'Re-indexing workspace...' } });
      if (this.andorCore) {
        await this.andorCore.initialize();
      } else {
        this.indexer.indexWorkspace();
      }
      this.postMessage({ type: 'indexingStatus', indexingStatus: { state: 'ready', progress: 100, totalFiles: 0, indexedFiles: 0, message: 'Workspace indexed' } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'indexingStatus', indexingStatus: { state: 'error', progress: 0, totalFiles: 0, indexedFiles: 0, message: msg } });
    }
  }

  private async handleGetIndexedFiles(): Promise<void> {
    const allFiles = this.indexer.getAllFiles?.() || [];
    this.webviewView?.webview.postMessage({ type: 'indexedFiles', files: allFiles });
  }

  private async findFastModel(): Promise<string> {
    const configured = await this.providerRegistry.getConfiguredProviders();
    // Find providers with API keys, prefer non-puter first for speed
    const withKey = configured.filter(c => c.hasKey && c.provider.id !== 'puter');
    if (withKey.length > 0) {
      const p = withKey[0].provider;
      const models = p.getModels();
      if (models.length > 0) {
        return `${p.id}::${models[0].id}`;
      }
    }
    // Puter is always available as last resort
    const puterProvider = configured.find(c => c.provider.id === 'puter');
    if (puterProvider) {
      return 'puter::gpt-4o-mini';
    }
    throw new Error('No AI provider configured. Please add an API key in Settings.');
  }

  private async handleGetMemory(): Promise<void> {
    if (this.andorCore) {
      try {
        const memory = this.andorCore.getMemoryData();
        this.postMessage({ type: 'memoryData', memory });
      } catch (err) {
        console.error('[Andor] Failed to get memory:', err);
        this.postMessage({ type: 'memoryData', memory: null });
      }
    }
  }

  private async handleClearMemory(): Promise<void> {
    if (this.andorCore) {
      try {
        await this.andorCore.clearMemory();
        this.postMessage({ type: 'memoryData', memory: null });
      } catch (err) {
        console.error('[Andor] Failed to clear memory:', err);
      }
    }
  }

  private async handleSendMessage(message: WebviewToExtensionMessage): Promise<void> {
    console.log('[Andor] handleSendMessage started');
    const userText = message.text || '';
    console.log('[Andor] User text:', userText.substring(0, 50));
    
    const diagnostics = this.diagnosticsWatcher.getDiagnostics();
    console.log('[Andor] Got diagnostics:', diagnostics.length);

    // Rebuild import graph for changed files
    if (this.importGraph) {
      this.importGraph.build();
    }

    const contextFiles = this.contextAssembler.assembleContext(userText, diagnostics);
    console.log('[Andor] Assembled context files:', contextFiles.length);
    
    let systemPrompt = this.contextAssembler.buildSystemPrompt(contextFiles, diagnostics);
    
    // Append mode/thinking instructions from webview
    if (message.systemPrompt) {
      systemPrompt += '\n' + message.systemPrompt;
    }

    // Add core behavior instructions
    systemPrompt += ANDOR_BEHAVIOR_PROMPT;

    // Add cloud context if detected
    const workspaceRoot = this.indexer.getWorkspaceRoot();
    if (workspaceRoot) {
      const cloudCtx = CloudDetector.detect(workspaceRoot);
      const cloudPrompt = CloudDetector.formatForPrompt(cloudCtx);
      if (cloudPrompt) {
        systemPrompt += '\n' + cloudPrompt;
      }
    }

    // Log relevance scoring info (for debugging / future Context Inspector UI)
    if (this.relevanceScorer) {
      const scored = this.relevanceScorer.scoreFiles(userText, diagnostics);
      const included = this.relevanceScorer.getIncludedFiles(scored);
      console.log(`[Andor] Relevance scorer: ${scored.length} files scored, ${included.length} included in context`);
    }

    console.log('[Andor] Built system prompt, length:', systemPrompt.length);

    console.log('[Andor] Posting context to webview');
    this.postMessage({
      type: 'context',
      files: contextFiles.map(f => ({
        path: f.path,
        relativePath: f.relativePath,
        content: '',
        reason: f.reason,
      })),
    });

    console.log('[Andor] Posting response to webview');
    this.postMessage({
      type: 'response',
      text: JSON.stringify({
        systemPrompt,
        userMessage: userText,
        model: message.model || 'claude-sonnet-4',
        images: message.images || [],
      }),
    });
    console.log('[Andor] handleSendMessage complete');
  }

  private async handleApplyCode(message: WebviewToExtensionMessage): Promise<void> {
    const code = message.code || '';
    let filePath = message.filePath || '';
    const workspaceRoot = this.indexer.getWorkspaceRoot();

    if (!filePath && workspaceRoot) {
      this.postMessage({ type: 'error', error: 'No file path specified for code application.' });
      return;
    }

    if (!path.isAbsolute(filePath) && workspaceRoot) {
      filePath = path.join(workspaceRoot, filePath);
    }

    try {
      const uri = vscode.Uri.file(filePath);
      const edit = new vscode.WorkspaceEdit();

      let existingContent = '';
      try {
        const existingBytes = await vscode.workspace.fs.readFile(uri);
        existingContent = Buffer.from(existingBytes).toString('utf-8');
      } catch {
        // File doesn't exist, will create it
      }

      if (existingContent) {
        const fullRange = new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(existingContent.split('\n').length, 0),
        );
        edit.replace(uri, fullRange, code);
      } else {
        edit.createFile(uri, { ignoreIfExists: true });
        edit.insert(uri, new vscode.Position(0, 0), code);
      }

      const success = await vscode.workspace.applyEdit(edit);
      if (success) {
        const doc = await vscode.workspace.openTextDocument(uri);
        await doc.save();
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(`Andor: Applied changes to ${path.basename(filePath)}`);
      } else {
        this.postMessage({ type: 'error', error: 'Failed to apply edit.' });
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'error', error: `Failed to apply code: ${errorMsg}` });
    }
  }

  private async handleRequestDiff(message: WebviewToExtensionMessage): Promise<void> {
    const code = message.code || '';
    let filePath = message.filePath || '';
    const workspaceRoot = this.indexer.getWorkspaceRoot();

    if (!path.isAbsolute(filePath) && workspaceRoot) {
      filePath = path.join(workspaceRoot, filePath);
    }

    let originalContent = '';
    try {
      originalContent = fs.readFileSync(filePath, 'utf-8');
    } catch {
      // New file
    }

    const diff: DiffResult = {
      filePath,
      originalContent,
      newContent: code,
    };

    this.postMessage({ type: 'diffResult', diff });
  }

  private handleGetContext(userMessage: string): void {
    const diagnostics = this.diagnosticsWatcher.getDiagnostics();
    const contextFiles = this.contextAssembler.assembleContext(userMessage, diagnostics);
    this.postMessage({
      type: 'context',
      files: contextFiles.map(f => ({
        path: f.path,
        relativePath: f.relativePath,
        content: '',
        reason: f.reason,
      })),
    });
  }

  private async handleRunTerminal(message: WebviewToExtensionMessage): Promise<void> {
    const command = message.command || '';
    if (!command.trim()) {
      this.postMessage({ type: 'terminalResult', output: 'No command provided', exitCode: 1 });
      return;
    }
    const workspaceRoot = this.indexer.getWorkspaceRoot() || process.cwd();
    try {
      const result = await new Promise<{ output: string; exitCode: number }>((resolve) => {
        cp.exec(command, { cwd: workspaceRoot, timeout: 60000, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
          const output = [stdout, stderr].filter(Boolean).join('\n').trim();
          resolve({ output: output || '(no output)', exitCode: err?.code ?? 0 });
        });
      });

      // Parse terminal output for structured errors
      const parsed = TerminalParser.parse(result.output, result.exitCode);
      if (!parsed.isSuccess && parsed.errors.length > 0) {
        const errorSummary = TerminalParser.formatForAI(parsed);
        console.log(`[Andor] Terminal errors detected (${parsed.errors.length}):`, errorSummary.substring(0, 200));
        // Send enriched result with parsed error info
        this.webviewView?.webview.postMessage({
          type: 'terminalResult',
          output: result.output,
          exitCode: result.exitCode,
          parsedErrors: parsed.errors,
          errorSummary,
          suggestedFix: parsed.suggestedFix,
        });
      } else {
        this.postMessage({ type: 'terminalResult', output: result.output, exitCode: result.exitCode });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'terminalResult', output: `Error: ${msg}`, exitCode: 1 });
    }
  }

  private async handleWriteFile(message: WebviewToExtensionMessage): Promise<void> {
    let filePath = message.filePath || '';
    const content = message.content ?? '';
    const workspaceRoot = this.indexer.getWorkspaceRoot();
    if (!filePath) {
      this.postMessage({ type: 'error', error: 'writeFile: no filePath provided' });
      return;
    }
    if (!path.isAbsolute(filePath) && workspaceRoot) {
      filePath = path.join(workspaceRoot, filePath);
    }
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      // Refresh editor
      const uri = vscode.Uri.file(filePath);
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch { /* ignore if can't open */ }
      this.postMessage({ type: 'fileWritten', filePath });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'error', error: `writeFile failed: ${msg}` });
    }
  }

  private async handleReadFile(message: WebviewToExtensionMessage): Promise<void> {
    let filePath = message.filePath || '';
    const workspaceRoot = this.indexer.getWorkspaceRoot();
    if (!filePath) {
      this.postMessage({ type: 'error', error: 'readFile: no filePath provided' });
      return;
    }
    if (!path.isAbsolute(filePath) && workspaceRoot) {
      filePath = path.join(workspaceRoot, filePath);
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.postMessage({ type: 'fileContent', filePath, content });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'error', error: `readFile failed: ${msg}` });
    }
  }

  private async handleLogout(): Promise<void> {
    console.log('[Andor] Logging out - clearing stored token');
    this.puterToken = null;
    await this.context.secrets.delete('puterToken');
    vscode.window.showInformationMessage('Signed out of Puter.');
  }

  private async handleStartPuterAuth(): Promise<void> {
    console.log('[Andor] Starting Puter authentication flow');

    try {
      // Use Puter.js Node helper which performs browser-based auth and returns a token.
      // This avoids VS Code webview popup restrictions.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const puterInit = require('@heyputer/puter.js/src/init.cjs') as {
        getAuthToken?: () => Promise<string>;
      };

      if (!puterInit?.getAuthToken) {
        throw new Error('Puter getAuthToken() is not available. Ensure @heyputer/puter.js is installed.');
      }

      vscode.window.showInformationMessage('Opening Puter.com login in your browser...');
      const token = await puterInit.getAuthToken();

      if (!token) {
        throw new Error('No token received from Puter authentication.');
      }

      await this.context.secrets.store('puterToken', token);
      this.puterToken = token;
      this.postMessage({ type: 'puterToken', token });

      vscode.window.showInformationMessage('Successfully authenticated with Puter.com!');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[Andor] Failed to start auth:', errorMsg);
      this.postMessage({ type: 'error', error: `Failed to start authentication: ${errorMsg}` });
      vscode.window.showErrorMessage(`Failed to start Puter authentication: ${errorMsg}`);
    }
  }

  // === PROVIDER HANDLERS ===

  private async handleGetProviders(): Promise<void> {
    const configured = await this.providerRegistry.getConfiguredProviders();
    const providers: ProviderInfo[] = configured.map(({ provider, hasKey }) => ({
      id: provider.id,
      name: provider.name,
      hasKey,
      modelCount: provider.getModels().length,
      status: provider.id === 'puter' ? 'configured' as const :
              hasKey ? 'untested' as const : 'unconfigured' as const,
    }));
    this.postMessage({ type: 'providers', providers });
  }

  private async handleSetApiKey(message: WebviewToExtensionMessage): Promise<void> {
    const { providerId, apiKey } = message;
    if (!providerId || !apiKey) {
      this.postMessage({ type: 'error', error: 'Missing providerId or apiKey' });
      return;
    }
    await this.providerRegistry.setApiKey(providerId, apiKey);
    this.postMessage({ type: 'apiKeyStored', providerId, success: true });
  }

  private async handleDeleteApiKey(message: WebviewToExtensionMessage): Promise<void> {
    const { providerId } = message;
    if (!providerId) {
      this.postMessage({ type: 'error', error: 'Missing providerId' });
      return;
    }
    await this.providerRegistry.deleteApiKey(providerId);
    this.postMessage({ type: 'apiKeyDeleted', providerId, success: true });
  }

  private async handleTestProvider(message: WebviewToExtensionMessage): Promise<void> {
    const { providerId } = message;
    if (!providerId) {
      this.postMessage({ type: 'error', error: 'Missing providerId' });
      return;
    }
    const success = await this.providerRegistry.testProvider(providerId);
    this.postMessage({ type: 'providerTestResult', providerId, success });
  }

  private async mapProviderModels(provider: AIProvider, models: ProviderModel[]): Promise<ModelInfo[]> {
    return models.map((m) => ({
      id: m.id,
      name: m.name,
      providerId: provider.id,
      providerName: provider.name,
      contextWindow: m.contextWindow,
      free: m.free,
      bestFor: m.bestFor,
      tier: m.tier,
      modelSpec: `${provider.id}::${m.id}`,
    }));
  }

  private async refreshProviderModels(provider: AIProvider): Promise<ProviderModel[]> {
    if (!provider.refreshModels) {
      return provider.getModels();
    }
    const apiKey = provider.id === 'puter' ? 'puter' : await this.providerRegistry.getApiKey(provider.id);
    try {
      const refreshed = await provider.refreshModels(apiKey);
      if (refreshed.length > 0) {
        return refreshed;
      }
      return provider.getModels();
    } catch (err) {
      console.error(`[Andor] Failed to refresh models for ${provider.id}:`, err);
      return provider.getModels();
    }
  }

  private async handleGetModels(message: WebviewToExtensionMessage): Promise<void> {
    const { providerId } = message;
    let models: ModelInfo[];

    if (providerId) {
      const provider = this.providerRegistry.getProvider(providerId);
      if (!provider) {
        this.postMessage({ type: 'error', error: `Unknown provider: ${providerId}` });
        return;
      }
      const refreshedModels = await this.refreshProviderModels(provider);
      models = await this.mapProviderModels(provider, refreshedModels);
    } else {
      const providers = this.providerRegistry.getAllProviders();
      const refreshedGroups = await Promise.all(providers.map(async (provider) => {
        const providerModels = await this.refreshProviderModels(provider);
        return this.mapProviderModels(provider, providerModels);
      }));
      models = refreshedGroups.flat();
      if (models.length === 0) {
        const fallbackGroups = providers.map((provider) => this.mapProviderModels(provider, provider.getModels()));
        models = (await Promise.all(fallbackGroups)).flat();
      }
    }

    this.postMessage({ type: 'models', models });
  }

  // === COMMAND APPROVAL HANDLERS ===

  private getAllowlistPath(): string {
    const workspaceRoot = this.indexer.getWorkspaceRoot() || '';
    return path.join(workspaceRoot, '.vscode', 'andor-allowlist.json');
  }

  private loadAllowlist(): AllowlistFile {
    try {
      const filePath = this.getAllowlistPath();
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return data as AllowlistFile;
      }
    } catch {
      // ignore
    }
    return { version: '1', patterns: [] };
  }

  private saveAllowlist(allowlist: AllowlistFile): void {
    try {
      const filePath = this.getAllowlistPath();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(allowlist, null, 2), 'utf-8');
    } catch (err: unknown) {
      console.error('[Andor] Failed to save allowlist:', err);
    }
  }

  private isCommandAutoAllowed(command: string): boolean {
    // Check built-in auto-allowed patterns
    if (AUTO_ALLOWED.some(re => re.test(command))) {
      return true;
    }
    // Check user allowlist
    const allowlist = this.loadAllowlist();
    const patterns = allowlist.patterns.map(p => p.pattern);
    return matchesAllowlist(command, patterns);
  }

  async requestCommandApproval(command: string): Promise<boolean> {
    if (this.isCommandAutoAllowed(command)) {
      return true;
    }

    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Describe what the command does
    let description = 'This command will be executed in your workspace.';
    if (command.startsWith('npm install')) {
      description = 'This will install packages to node_modules/';
    } else if (command.startsWith('rm ') || command.startsWith('del ')) {
      description = 'This will delete files. Please review carefully.';
    } else if (command.startsWith('git push') || command.startsWith('git commit')) {
      description = 'This will modify your git repository.';
    }

    this.postMessage({
      type: 'commandApproval',
      commandApproval: { commandId, command, description },
    });

    return new Promise<boolean>((resolve) => {
      this.pendingCommands.set(commandId, { command, resolve });
      // Auto-deny after 5 minutes
      setTimeout(() => {
        if (this.pendingCommands.has(commandId)) {
          this.pendingCommands.delete(commandId);
          resolve(false);
        }
      }, 300000);
    });
  }

  private handleApproveCommand(message: WebviewToExtensionMessage): void {
    const { commandId } = message;
    if (!commandId) { return; }
    const pending = this.pendingCommands.get(commandId);
    if (pending) {
      this.pendingCommands.delete(commandId);
      pending.resolve(true);
    }
  }

  private handleDenyCommand(message: WebviewToExtensionMessage): void {
    const { commandId } = message;
    if (!commandId) { return; }
    const pending = this.pendingCommands.get(commandId);
    if (pending) {
      this.pendingCommands.delete(commandId);
      pending.resolve(false);
      this.postMessage({
        type: 'commandResult',
        commandId,
        output: `[COMMAND DENIED BY USER]: ${pending.command}`,
        exitCode: 1,
      });
    }
  }

  private async handleAlwaysAllowCommand(message: WebviewToExtensionMessage): Promise<void> {
    const { commandId } = message;
    if (!commandId) { return; }
    const pending = this.pendingCommands.get(commandId);
    if (pending) {
      // Add pattern to allowlist
      const pattern = message.pattern || extractPattern(pending.command);
      const allowlist = this.loadAllowlist();
      allowlist.patterns.push({
        pattern,
        addedAt: new Date().toISOString(),
        addedBy: 'user',
      });
      this.saveAllowlist(allowlist);

      this.pendingCommands.delete(commandId);
      pending.resolve(true);
    }
  }

  // === STREAMING WITH PROVIDER (extension-host side) ===

  private async handleStreamWithProvider(message: WebviewToExtensionMessage): Promise<void> {
    const modelSpec = message.model || '';
    const userText = message.text || '';
    const history = message.history || [];

    // Rebuild import graph on each request for fresh data
    if (this.importGraph) {
      this.importGraph.build();
    }

    // Assemble context/system prompt
    const diagnostics = this.diagnosticsWatcher.getDiagnostics();
    const contextFiles = this.contextAssembler.assembleContext(userText, diagnostics);
    let systemPrompt = this.contextAssembler.buildSystemPrompt(contextFiles, diagnostics);

    // Append mode/thinking instructions from webview
    if (message.systemPrompt) {
      systemPrompt += '\n' + message.systemPrompt;
    }

    // Add core behavior instructions
    systemPrompt += ANDOR_BEHAVIOR_PROMPT;

    // Add cloud context if detected
    const wsRoot = this.indexer.getWorkspaceRoot();
    if (wsRoot) {
      const cloudCtx = CloudDetector.detect(wsRoot);
      const cloudPrompt = CloudDetector.formatForPrompt(cloudCtx);
      if (cloudPrompt) {
        systemPrompt += '\n' + cloudPrompt;
      }
    }

    // Send context files to webview for display
    this.postMessage({
      type: 'context',
      files: contextFiles.map(f => ({
        path: f.path,
        relativePath: f.relativePath,
        content: '',
        reason: f.reason,
      })),
    });

    if (isPuterModel(modelSpec)) {
      // Puter models are handled by the webview — just pass through the context
      this.postMessage({
        type: 'response',
        text: JSON.stringify({
          systemPrompt,
          userMessage: userText,
          model: modelSpec,
          images: message.images || [],
        }),
      });
      return;
    }

    // Build messages array
    const aiMessages: AIMessage[] = [];
    aiMessages.push({ role: 'system', content: systemPrompt });
    for (const h of history) {
      aiMessages.push({ role: h.role as AIMessage['role'], content: h.content });
    }
    aiMessages.push({ role: 'user', content: userText });

    // Stream with session continuity (automatic retry, fallback, context management)
    const streamCallbacks = {
      onChunk: (text: string) => {
        this.postMessage({ type: 'streamChunk', text });
      },
      onDone: (fullText: string, response: { model: string; provider: string }) => {
        this.postMessage({
          type: 'streamDone',
          text: fullText,
          model: response.model,
          provider: response.provider,
        });
      },
      onError: (error: string) => {
        this.postMessage({ type: 'streamError', error });
      },
    };

    try {
      if (this.sessionContinuity) {
        await this.sessionContinuity.resilientStreamCall(aiMessages, modelSpec, streamCallbacks);
      } else {
        await this.providerRegistry.streamCall(aiMessages, modelSpec, streamCallbacks);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'streamError', error: errMsg });
    }
  }
}
