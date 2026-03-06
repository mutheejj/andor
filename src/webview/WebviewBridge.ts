import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { WebviewToExtensionMessage, ExtensionToWebviewMessage, DiffResult } from '../types';

import { WorkspaceIndexer } from '../indexer/WorkspaceIndexer';
import { ContextAssembler } from '../indexer/ContextAssembler';
import { DiagnosticsWatcher } from '../indexer/DiagnosticsWatcher';
import { PuterAuthServer } from '../auth/PuterAuthServer';

export class WebviewBridge {
  private webviewView: vscode.WebviewView | undefined;
  private indexer: WorkspaceIndexer;
  private contextAssembler: ContextAssembler;
  private diagnosticsWatcher: DiagnosticsWatcher;
  private context: vscode.ExtensionContext;
  private authServer: PuterAuthServer;
  private puterToken: string | null = null;

  constructor(
    indexer: WorkspaceIndexer,
    contextAssembler: ContextAssembler,
    diagnosticsWatcher: DiagnosticsWatcher,
    context: vscode.ExtensionContext,
    authServer: PuterAuthServer,
  ) {
    this.indexer = indexer;
    this.contextAssembler = contextAssembler;
    this.diagnosticsWatcher = diagnosticsWatcher;
    this.context = context;
    this.authServer = authServer;

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
}
