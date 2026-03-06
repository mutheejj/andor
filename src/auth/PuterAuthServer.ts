import * as http from 'http';
import * as vscode from 'vscode';

export class PuterAuthServer {
  private server: http.Server | null = null;
  private port = 3847;

  async startServer(
    onTokenReceived: (token: string) => void,
    onError: (error: string) => void
  ): Promise<void> {
    if (this.server) {
      console.log('[PuterAuth] Server already running');
      return;
    }

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        console.log('[PuterAuth] Request received:', req.url);

        if (req.url?.startsWith('/callback')) {
          // Parse the URL to get the token
          const url = new URL(req.url, `http://localhost:${this.port}`);
          const token = url.searchParams.get('token') || url.searchParams.get('access_token');

          if (token) {
            console.log('[PuterAuth] Token received');
            
            // Send success response to browser
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Authentication Successful</title>
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      height: 100vh;
                      margin: 0;
                      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .container {
                      background: white;
                      padding: 40px;
                      border-radius: 12px;
                      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                      text-align: center;
                      max-width: 400px;
                    }
                    .success-icon {
                      font-size: 64px;
                      margin-bottom: 20px;
                    }
                    h1 {
                      color: #333;
                      margin: 0 0 10px 0;
                      font-size: 24px;
                    }
                    p {
                      color: #666;
                      margin: 0;
                      font-size: 16px;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="success-icon">✅</div>
                    <h1>Authentication Successful!</h1>
                    <p>You can close this window and return to VS Code.</p>
                  </div>
                  <script>
                    // Auto-close after 2 seconds
                    setTimeout(() => window.close(), 2000);
                  </script>
                </body>
              </html>
            `);

            // Stop the server after successful auth
            setTimeout(() => {
              this.stopServer();
            }, 1000);

            // Notify callback
            onTokenReceived(token);
          } else {
            console.error('[PuterAuth] No token in callback URL');
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html>
                <head><title>Authentication Failed</title></head>
                <body>
                  <h1>Authentication Failed</h1>
                  <p>No token received. Please try again.</p>
                </body>
              </html>
            `);
            onError('No token received from Puter');
            this.stopServer();
          }
        } else {
          // Unknown route
          res.writeHead(404);
          res.end('Not found');
        }
      });

      this.server.listen(this.port, 'localhost', () => {
        console.log(`[PuterAuth] Server listening on http://localhost:${this.port}`);
        resolve();
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        console.error('[PuterAuth] Server error:', err);
        if (err.code === 'EADDRINUSE') {
          onError(`Port ${this.port} is already in use. Please close any applications using this port.`);
        } else {
          onError(err.message);
        }
        this.server = null;
      });
    });
  }

  stopServer(): void {
    if (this.server) {
      console.log('[PuterAuth] Stopping server');
      this.server.close();
      this.server = null;
    }
  }

  getCallbackUrl(): string {
    return `http://localhost:${this.port}/callback`;
  }
}
