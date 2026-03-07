import * as vscode from 'vscode';
import * as crypto from 'crypto';

export class PrivacyManager {
  private static readonly SESSION_KEY = 'andor.learning.sessionId';
  private static readonly SESSION_CREATED_KEY = 'andor.learning.sessionCreated';
  private static readonly OPT_IN_KEY = 'andor.learning.optedIn';
  private static readonly ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(private context: vscode.ExtensionContext) {}

  getSessionId(): string {
    const created = this.context.globalState.get<number>(
      PrivacyManager.SESSION_CREATED_KEY, 0
    );
    const now = Date.now();
    const needsRotation = now - created > PrivacyManager.ONE_WEEK_MS;

    if (needsRotation) {
      const newId = crypto.randomUUID();
      this.context.globalState.update(PrivacyManager.SESSION_KEY, newId);
      this.context.globalState.update(PrivacyManager.SESSION_CREATED_KEY, now);
      return newId;
    }

    return this.context.globalState.get<string>(
      PrivacyManager.SESSION_KEY,
      crypto.randomUUID()
    );
  }

  isOptedIn(): boolean {
    return this.context.globalState.get<boolean>(
      PrivacyManager.OPT_IN_KEY, false
    );
  }

  async promptOptIn(): Promise<boolean> {
    const hasBeenAsked = this.context.globalState.get<boolean>(
      'andor.learning.hasBeenAsked', false
    );
    if (hasBeenAsked) return this.isOptedIn();

    const choice = await vscode.window.showInformationMessage(
      '🧠 Help Andor learn! Share anonymous usage patterns to improve model recommendations for everyone. No code or personal data is ever collected.',
      'Yes, help improve Andor',
      'No thanks'
    );

    const optedIn = choice === 'Yes, help improve Andor';
    await this.context.globalState.update(PrivacyManager.OPT_IN_KEY, optedIn);
    await this.context.globalState.update('andor.learning.hasBeenAsked', true);
    return optedIn;
  }

  sanitizeErrorPattern(error: string): string {
    return error
      .replace(/\/[^\s]+/g, '[PATH]')
      .replace(/\b[A-Z][a-z]+[A-Z]\w+/g, '[VAR]')
      .replace(/['"][^'"]+['"]/g, '[STRING]')
      .replace(/\b\d+\b/g, '[NUM]')
      .replace(/\S+@\S+/g, '[EMAIL]')
      .trim()
      .substring(0, 200);
  }

  detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript',
      js: 'javascript', jsx: 'javascript',
      py: 'python', go: 'go', rs: 'rust',
      java: 'java', cs: 'csharp', php: 'php',
      rb: 'ruby', swift: 'swift', kt: 'kotlin',
    };
    return map[ext ?? ''] ?? 'other';
  }

  async detectFramework(workspaceRoot: string): Promise<string> {
    try {
      const pkgPath = vscode.Uri.file(`${workspaceRoot}/package.json`);
      const content = await vscode.workspace.fs.readFile(pkgPath);
      const pkg = JSON.parse(Buffer.from(content).toString());
      const deps = {
        ...pkg.dependencies ?? {},
        ...pkg.devDependencies ?? {},
      };

      if (deps['next'])       return 'nextjs';
      if (deps['react'])      return 'react';
      if (deps['vue'])        return 'vue';
      if (deps['@angular/core']) return 'angular';
      if (deps['svelte'])     return 'svelte';
      if (deps['express'])    return 'express';
      if (deps['nestjs'] || deps['@nestjs/core']) return 'nestjs';
      if (deps['django'])     return 'django';
      return 'other';
    } catch {
      return 'other';
    }
  }
}
