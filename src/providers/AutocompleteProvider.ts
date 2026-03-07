import * as vscode from 'vscode';
import { ProviderRegistry } from './registry';
import { AIMessage } from './base';

/**
 * InlineCompletionProvider that uses the configured AI model to provide
 * autocomplete suggestions as the user types. Similar to Copilot/Continue tab-autocomplete.
 * 
 * Uses the fastest configured non-Puter provider, with debouncing and caching.
 */
export class AndorAutocompleteProvider implements vscode.InlineCompletionItemProvider {
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private lastRequestId = 0;
  private enabled = true;
  private autocompleteModel = '';
  private readonly debounceMs = 350;
  private readonly maxContextLines = 50;
  private cache = new Map<string, { completion: string; timestamp: number }>();
  private readonly cacheTtl = 30000; // 30s

  constructor(
    private readonly providerRegistry: ProviderRegistry,
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setModel(modelSpec: string): void {
    this.autocompleteModel = modelSpec;
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (!this.enabled || !this.autocompleteModel) return undefined;

    const lineText = document.lineAt(position.line).text;
    const textBeforeCursor = lineText.substring(0, position.character);

    // Skip empty lines or very short context
    if (textBeforeCursor.trim().length < 3) return undefined;

    // Debounce
    const requestId = ++this.lastRequestId;
    await new Promise<void>(resolve => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(resolve, this.debounceMs);
    });

    if (token.isCancellationRequested || requestId !== this.lastRequestId) {
      return undefined;
    }

    // Check cache
    const cacheKey = `${document.uri.toString()}:${position.line}:${textBeforeCursor}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      return [new vscode.InlineCompletionItem(cached.completion, new vscode.Range(position, position))];
    }

    try {
      const completion = await this.getCompletion(document, position, token, requestId);
      if (!completion || token.isCancellationRequested || requestId !== this.lastRequestId) {
        return undefined;
      }

      // Cache it
      this.cache.set(cacheKey, { completion, timestamp: Date.now() });
      // Prune old entries
      if (this.cache.size > 100) {
        const now = Date.now();
        for (const [key, val] of this.cache) {
          if (now - val.timestamp > this.cacheTtl) this.cache.delete(key);
        }
      }

      return [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))];
    } catch (err) {
      console.error('[Andor Autocomplete] Error:', err);
      return undefined;
    }
  }

  private async getCompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    requestId: number,
  ): Promise<string | undefined> {
    const prefix = this.getPrefix(document, position);
    const suffix = this.getSuffix(document, position);
    const language = document.languageId;
    const fileName = document.fileName.split('/').pop() || 'file';

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: 'You are a code completion engine. Return ONLY the code to insert at the cursor. No explanation, no markdown fences, no comments about the code. Just the raw completion text.',
      },
      {
        role: 'user',
        content: `File: ${fileName} (${language})\n\nCode before cursor:\n${prefix}<CURSOR>\n\nCode after cursor:\n${suffix}\n\nComplete the code at <CURSOR>. Output ONLY the inserted text. Keep it short (1-3 lines max). Do not repeat any prefix text.`,
      },
    ];

    return new Promise<string | undefined>((resolve) => {
      let result = '';
      let resolved = false;

      const done = (text: string) => {
        if (resolved) return;
        resolved = true;
        text = text.trim();
        // Remove markdown code fences if the model added them
        if (text.startsWith('```')) {
          const lines = text.split('\n');
          lines.shift();
          if (lines[lines.length - 1]?.startsWith('```')) lines.pop();
          text = lines.join('\n');
        }
        resolve(text || undefined);
      };

      // Timeout after 5 seconds
      const timeout = setTimeout(() => done(result), 5000);

      this.providerRegistry.streamCall(
        messages,
        this.autocompleteModel,
        {
          onChunk: (chunk: string) => {
            if (token.isCancellationRequested || requestId !== this.lastRequestId) {
              done(result);
              return;
            }
            result += chunk;
            // Stop early after double newline (completion is done)
            if (result.includes('\n\n')) {
              result = result.split('\n\n')[0];
              done(result);
            }
          },
          onDone: (fullText: string) => {
            clearTimeout(timeout);
            done(fullText);
          },
          onError: () => {
            clearTimeout(timeout);
            done('');
          },
        },
      ).catch(() => {
        clearTimeout(timeout);
        done('');
      });
    });
  }

  private getPrefix(document: vscode.TextDocument, position: vscode.Position): string {
    const startLine = Math.max(0, position.line - this.maxContextLines);
    const range = new vscode.Range(startLine, 0, position.line, position.character);
    return document.getText(range);
  }

  private getSuffix(document: vscode.TextDocument, position: vscode.Position): string {
    const endLine = Math.min(document.lineCount - 1, position.line + 20);
    const range = new vscode.Range(position.line, position.character, endLine, document.lineAt(endLine).text.length);
    return document.getText(range);
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.cache.clear();
  }
}
