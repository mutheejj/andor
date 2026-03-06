import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { WebviewToExtensionMessage, ExtensionToWebviewMessage, DiffResult, AllowlistFile, ProviderInfo, ModelInfo } from '../types';

import { WorkspaceIndexer } from '../indexer/WorkspaceIndexer';
import { ContextAssembler } from '../indexer/ContextAssembler';
import { DiagnosticsWatcher } from '../indexer/DiagnosticsWatcher';
import { PuterAuthServer } from '../auth/PuterAuthServer';
import { ProviderRegistry, isPuterModel } from '../providers';
import { AIMessage } from '../providers/base';

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
  private indexer: WorkspaceIndexer;
  private contextAssembler: ContextAssembler;
  private diagnosticsWatcher: DiagnosticsWatcher;
  private context: vscode.ExtensionContext;
  private authServer: PuterAuthServer;
  private providerRegistry: ProviderRegistry;
  private puterToken: string | null = null;
  private pendingCommands: Map<string, { command: string; resolve: (approved: boolean) => void }> = new Map();

  constructor(
    indexer: WorkspaceIndexer,
    contextAssembler: ContextAssembler,
    diagnosticsWatcher: DiagnosticsWatcher,
    context: vscode.ExtensionContext,
    authServer: PuterAuthServer,
    providerRegistry: ProviderRegistry,
  ) {
    this.indexer = indexer;
    this.contextAssembler = contextAssembler;
    this.diagnosticsWatcher = diagnosticsWatcher;
    this.context = context;
    this.authServer = authServer;
    this.providerRegistry = providerRegistry;

    this.diagnosticsWatcher.onChange((diagnostics) => {
      this.postMessage({ type: 'diagnostics', diagnostics });
    });
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
          vscode.env.openExternal(vscode.Uri.parse(message.url));
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
      default:
        console.log('[Andor] Unknown message type:', message.type);
    }
  }

  private async handleSendMessage(message: WebviewToExtensionMessage): Promise<void> {
    console.log('[Andor] handleSendMessage started');
    const userText = message.text || '';
    console.log('[Andor] User text:', userText.substring(0, 50));
    
    const diagnostics = this.diagnosticsWatcher.getDiagnostics();
    console.log('[Andor] Got diagnostics:', diagnostics.length);
    
    const contextFiles = this.contextAssembler.assembleContext(userText, diagnostics);
    console.log('[Andor] Assembled context files:', contextFiles.length);
    
    const systemPrompt = this.contextAssembler.buildSystemPrompt(contextFiles, diagnostics);
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
      this.postMessage({ type: 'terminalResult', output: result.output, exitCode: result.exitCode });
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

  private async handleGetModels(message: WebviewToExtensionMessage): Promise<void> {
    const { providerId } = message;
    let models: ModelInfo[];

    if (providerId) {
      const provider = this.providerRegistry.getProvider(providerId);
      if (!provider) {
        this.postMessage({ type: 'error', error: `Unknown provider: ${providerId}` });
        return;
      }
      models = provider.getModels().map(m => ({
        id: m.id,
        name: m.name,
        providerId: provider.id,
        providerName: provider.name,
        contextWindow: m.contextWindow,
        free: m.free,
        bestFor: m.bestFor,
        tier: m.tier,
      }));
    } else {
      const allModels = this.providerRegistry.getAllModels();
      models = allModels.map(({ provider, model }) => ({
        id: model.id,
        name: model.name,
        providerId: provider.id,
        providerName: provider.name,
        contextWindow: model.contextWindow,
        free: model.free,
        bestFor: model.bestFor,
        tier: model.tier,
      }));
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

    // Assemble context/system prompt
    const diagnostics = this.diagnosticsWatcher.getDiagnostics();
    const contextFiles = this.contextAssembler.assembleContext(userText, diagnostics);
    const systemPrompt = this.contextAssembler.buildSystemPrompt(contextFiles, diagnostics);

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

    // Stream with the provider
    try {
      await this.providerRegistry.streamCall(
        aiMessages,
        modelSpec,
        {
          onChunk: (text: string) => {
            this.postMessage({ type: 'streamChunk', text });
          },
          onDone: (fullText: string, response) => {
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
        },
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'streamError', error: errMsg });
    }
  }
}
