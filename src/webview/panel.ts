import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WebviewBridge } from './WebviewBridge';

export class PuterCoderViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'andor.chatView';
  private bridge: WebviewBridge;
  private extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri, bridge: WebviewBridge) {
    this.extensionUri = extensionUri;
    this.bridge = bridge;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      enableForms: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'webview-ui'),
      ],
    };

    this.bridge.setWebviewView(webviewView);
    webviewView.webview.html = this.getHtmlContent(webviewView.webview);
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const distPath = path.join(this.extensionUri.fsPath, 'webview-ui', 'dist');
    const assetsPath = path.join(distPath, 'assets');
    
    // Check if built files exist
    const jsFiles = fs.existsSync(assetsPath) ? fs.readdirSync(assetsPath).filter(f => f.endsWith('.js')) : [];
    const cssFiles = fs.existsSync(assetsPath) ? fs.readdirSync(assetsPath).filter(f => f.endsWith('.css')) : [];
    
    if (jsFiles.length === 0) {
      console.log('[Andor] No built JS files found in webview-ui/dist/assets');
      return this.getFallbackHtml(webview);
    }

    // Get webview URIs for the built assets
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'assets', jsFiles[0])
    );
    const styleUri = cssFiles.length > 0 ? webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'assets', cssFiles[0])
    ) : null;

    const nonce = getNonce();

    // CSP that allows Puter.js initialization with all required permissions
    const csp = `default-src 'none'; script-src ${webview.cspSource} https://js.puter.com 'unsafe-inline' 'unsafe-eval' blob:; style-src ${webview.cspSource} 'unsafe-inline'; connect-src https: wss: http: ws:; frame-src https://puter.com https://*.puter.com; child-src https://puter.com blob:; img-src ${webview.cspSource} data: https:; font-src ${webview.cspSource} data:;`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Andor</title>
  ${styleUri ? `<link rel="stylesheet" href="${styleUri}">` : ''}
</head>
<body>
  <div id="root">Initializing Andor...</div>
  
  <script>
    // Acquire VS Code API once and store globally for React to use
    window.__vscode = acquireVsCodeApi();
  </script>
  
  <script>
    // Puter.js configuration MUST be set before loading the Puter.js script
    // (required for UI/auth features to initialize reliably).
    window.puter_app_id = 'andor-vscode';
    window.puter_origin = 'https://puter.com';
  </script>

  <!-- Load Puter.js -->
  <script src="https://js.puter.com/v2/"></script>
  
  <script>
    // Wait for Puter to be ready, then load React
    function waitForPuter() {
      return new Promise(function(resolve) {
        if (window.puter && window.puter.ai) {
          resolve();
        } else {
          window.addEventListener('puterready', function() { resolve(); });
          setTimeout(function() { resolve(); }, 5000);
        }
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

  private getFallbackHtml(_webview: vscode.Webview): string {
    const csp = `default-src 'none'; script-src 'self' https://js.puter.com 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.puter.com wss://*.puter.com https://*.anthropic.com https://*.openai.com; frame-src https://puter.com https://*.puter.com; child-src https://puter.com blob:; img-src 'self' data: https:; font-src 'self' data:;`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PuterCoder</title>
  <script src="https://js.puter.com/v2/"></script>
  <style>
    body {
      margin: 0; padding: 16px;
      font-family: var(--vscode-font-family);
      background: var(--vscode-sideBar-background);
      color: var(--vscode-sideBar-foreground);
    }
    .info { text-align: center; margin-top: 40px; }
    .info h2 { color: var(--vscode-foreground); }
    .info p { color: var(--vscode-descriptionForeground); margin: 8px 0; }
    .info code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px; border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }
  </style>
</head>
<body>
  <div class="info">
    <h2>Andor</h2>
    <p>The webview UI has not been built yet.</p>
    <p>Run: <code>cd webview-ui && npm run build</code></p>
    <p>Then reload VS Code.</p>
  </div>
  <script>
    // Test Puter.js in fallback mode
    console.log('[Andor] Fallback HTML loaded');
    console.log('puter available:', typeof window.puter);
    if (window.puter) {
      console.log('Testing puter.ai.chat...');
      window.puter.ai.chat('say hello', { model: 'claude-sonnet-4' })
        .then(r => console.log('Puter test response:', r))
        .catch(e => console.error('Puter test error:', e));
    }
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
