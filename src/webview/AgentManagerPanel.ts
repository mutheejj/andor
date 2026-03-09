import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WebviewBridge } from './WebviewBridge';

export class AgentManagerPanel implements vscode.Disposable {
  public static readonly viewType = 'andor.agentManagerPanel';

  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly bridge: WebviewBridge,
  ) {}

  openPanel(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      AgentManagerPanel.viewType,
      'Agent Manager',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        enableForms: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist'),
          vscode.Uri.joinPath(this.extensionUri, 'webview-ui'),
        ],
      },
    );

    this.panel.iconPath = vscode.ThemeIcon.File;
    this.bridge.setWebviewPanel(this.panel);
    this.panel.webview.html = this.getHtmlContent(this.panel.webview);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.bridge.clearWebviewPanel(this.panel);
    });
  }

  focusPanel(): void {
    this.panel?.reveal(vscode.ViewColumn.One);
  }

  postMessage(message: unknown): void {
    this.panel?.webview.postMessage(message);
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const distPath = path.join(this.extensionUri.fsPath, 'webview-ui', 'dist');
    const assetsPath = path.join(distPath, 'assets');
    const jsFiles = fs.existsSync(assetsPath) ? fs.readdirSync(assetsPath).filter((file) => file.endsWith('.js')) : [];
    const cssFiles = fs.existsSync(assetsPath) ? fs.readdirSync(assetsPath).filter((file) => file.endsWith('.css')) : [];

    if (jsFiles.length === 0) {
      return this.getFallbackHtml();
    }

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'assets', jsFiles[0]));
    const styleUri = cssFiles.length > 0
      ? webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'assets', cssFiles[0]))
      : null;
    const nonce = getNonce();
    const csp = `default-src 'none'; script-src ${webview.cspSource} https://js.puter.com 'unsafe-inline' 'unsafe-eval' blob:; style-src ${webview.cspSource} 'unsafe-inline'; connect-src https: wss: http: ws:; frame-src https://puter.com https://*.puter.com; child-src https://puter.com blob:; img-src ${webview.cspSource} data: https:; font-src ${webview.cspSource} data:;`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Andor Agent Manager</title>
  ${styleUri ? `<link rel="stylesheet" href="${styleUri}">` : ''}
</head>
<body>
  <div id="root">Initializing Andor Agent Manager...</div>
  <script nonce="${nonce}">window.__vscode = acquireVsCodeApi(); window.__andorView = 'agent-manager';</script>
  <script nonce="${nonce}">window.puter_app_id = 'andor-vscode'; window.puter_origin = 'https://puter.com';</script>
  <script nonce="${nonce}" src="https://js.puter.com/v2/"></script>
  <script nonce="${nonce}">
    function waitForPuter() {
      return new Promise(function(resolve) {
        if (window.puter && window.puter.ai) {
          resolve();
          return;
        }
        window.addEventListener('puterready', function() { resolve(); });
        setTimeout(function() { resolve(); }, 5000);
      });
    }
    waitForPuter().then(function() {
      var s = document.createElement('script');
      s.type = 'module';
      s.src = '${scriptUri}?v=' + Date.now();
      document.body.appendChild(s);
    });
  </script>
</body>
</html>`;
  }

  private getFallbackHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Andor Agent Manager</title>
</head>
<body style="background:#1e1e1e;color:#ddd;font-family:sans-serif;padding:24px;">
  <h2>Andor Agent Manager</h2>
  <p>The webview UI has not been built yet.</p>
  <p>Run <code>npm run build</code> inside <code>webview-ui</code> and reload VS Code.</p>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let index = 0; index < 32; index += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
