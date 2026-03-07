import * as vscode from 'vscode';

interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export class SupabaseClient {
  private config: SupabaseConfig | null = null;

  private static readonly PUBLIC_URL = '';
  private static readonly PUBLIC_KEY = '';

  constructor(private context: vscode.ExtensionContext) {}

  async initialize(): Promise<void> {
    const customUrl = await this.context.secrets.get('andor.supabase.url');
    const customKey = await this.context.secrets.get('andor.supabase.key');

    if (customUrl && customKey) {
      this.config = { url: customUrl, anonKey: customKey };
    } else if (SupabaseClient.PUBLIC_URL && SupabaseClient.PUBLIC_KEY) {
      this.config = {
        url: SupabaseClient.PUBLIC_URL,
        anonKey: SupabaseClient.PUBLIC_KEY,
      };
    }
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  async insert(table: string, data: Record<string, unknown>): Promise<void> {
    if (!this.config) return;

    try {
      const response = await fetch(
        `${this.config.url}/rest/v1/${table}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.config.anonKey,
            'Authorization': `Bearer ${this.config.anonKey}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        console.debug(`[Andor Learning] Insert failed: ${response.status}`);
      }
    } catch (err) {
      console.debug('[Andor Learning] Network error, skipping:', err);
    }
  }

  async select<T>(
    table: string,
    params: Record<string, string> = {}
  ): Promise<T[] | null> {
    if (!this.config) return null;

    try {
      const query = new URLSearchParams({
        ...params,
        select: params.select ?? '*',
      });

      const response = await fetch(
        `${this.config.url}/rest/v1/${table}?${query}`,
        {
          headers: {
            'apikey': this.config.anonKey,
            'Authorization': `Bearer ${this.config.anonKey}`,
          },
        }
      );

      if (!response.ok) return null;
      return await response.json() as T[];
    } catch {
      return null;
    }
  }

  async rpc<T>(
    fn: string,
    params: Record<string, unknown> = {}
  ): Promise<T | null> {
    if (!this.config) return null;

    try {
      const response = await fetch(
        `${this.config.url}/rest/v1/rpc/${fn}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.config.anonKey,
            'Authorization': `Bearer ${this.config.anonKey}`,
          },
          body: JSON.stringify(params),
        }
      );

      if (!response.ok) return null;
      return await response.json() as T;
    } catch {
      return null;
    }
  }
}
