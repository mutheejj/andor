import { AIProvider, AIMessage, AIResponse, AIStreamCallbacks, ProviderModel } from './base';

const OPENROUTER_DEFAULT_MODELS: ProviderModel[] = [
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (Free)', contextWindow: 163840, free: true, bestFor: 'Reasoning', tier: 'powerful' },
  { id: 'deepseek/deepseek-coder-v2', name: 'DeepSeek Coder V2 (Free)', contextWindow: 131072, free: true, bestFor: 'Coding', tier: 'powerful' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B (Free)', contextWindow: 131072, free: true, bestFor: 'General', tier: 'powerful' },
  { id: 'google/gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Free)', contextWindow: 1048576, free: true, bestFor: '1M context free', tier: 'fast' },
  { id: 'mistralai/devstral-small', name: 'Devstral Small (Free)', contextWindow: 131072, free: true, bestFor: 'Coding agent free', tier: 'balanced' },
  { id: 'qwen/qwen3-235b-a22b', name: 'Qwen3 235B (Free)', contextWindow: 131072, free: true, bestFor: 'Largest free model', tier: 'powerful' },
  { id: 'moonshotai/kimi-k2', name: 'Kimi K2 (Free)', contextWindow: 1000000, free: true, bestFor: 'Agentic, 1M context', tier: 'powerful' },
];

const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_URL = 'https://openrouter.ai/api/v1/models';

export class OpenRouterProvider implements AIProvider {
  id = 'openrouter';
  name = 'OpenRouter';
  private dynamicModels: ProviderModel[] | null = null;
  private dynamicModelsFetchedAt = 0;

  async call(messages: AIMessage[], model: string, apiKey: string): Promise<AIResponse> {
    const resp = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/mutheejj/andor',
        'X-Title': 'Andor VS Code',
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`OpenRouter API error ${resp.status}: ${text || resp.statusText}`);
    }

    const data = await resp.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };

    const content = data?.choices?.[0]?.message?.content || '';
    return {
      content,
      model,
      provider: this.id,
      tokensUsed: data?.usage?.total_tokens,
    };
  }

  async streamCall(
    messages: AIMessage[],
    model: string,
    apiKey: string,
    callbacks: AIStreamCallbacks,
  ): Promise<void> {
    try {
      const resp = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/mutheejj/andor',
          'X-Title': 'Andor VS Code',
        },
        body: JSON.stringify({
          model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        callbacks.onError(`OpenRouter API error ${resp.status}: ${text || resp.statusText}`);
        return;
      }

      if (!resp.body) {
        callbacks.onError('No response body from OpenRouter');
        return;
      }

      const reader = resp.body as unknown as AsyncIterable<Uint8Array>;
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullText = '';

      for await (const chunk of reader) {
        buffer += decoder.decode(chunk, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trimEnd();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith('data:')) { continue; }
          const data = line.slice('data:'.length).trim();
          if (!data || data === '[DONE]') {
            if (data === '[DONE]') {
              callbacks.onDone(fullText, { content: fullText, model, provider: this.id });
              return;
            }
            continue;
          }
          try {
            const json = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = json?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              fullText += delta;
              callbacks.onChunk(fullText);
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      callbacks.onDone(fullText, { content: fullText, model, provider: this.id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      callbacks.onError(`OpenRouter stream error: ${msg}`);
    }
  }

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const resp = await fetch(MODELS_URL, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  getModels(): ProviderModel[] {
    if (this.dynamicModels && Date.now() - this.dynamicModelsFetchedAt < 3600000) {
      return this.dynamicModels;
    }
    return OPENROUTER_DEFAULT_MODELS;
  }

  async fetchDynamicModels(apiKey: string, showPaid: boolean = false): Promise<ProviderModel[]> {
    try {
      const resp = await fetch(MODELS_URL, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!resp.ok) { return OPENROUTER_DEFAULT_MODELS; }

      const data = await resp.json() as {
        data?: Array<{
          id: string;
          name: string;
          context_length?: number;
          pricing?: { prompt?: string; completion?: string };
        }>;
      };

      if (!data?.data) { return OPENROUTER_DEFAULT_MODELS; }

      const models: ProviderModel[] = data.data
        .filter(m => {
          if (showPaid) { return true; }
          return m.pricing?.prompt === '0' || m.pricing?.prompt === '0.0';
        })
        .slice(0, 100)
        .map(m => ({
          id: m.id,
          name: m.name,
          contextWindow: m.context_length || 4096,
          free: m.pricing?.prompt === '0' || m.pricing?.prompt === '0.0',
          bestFor: m.pricing?.prompt === '0' ? 'Free tier' : 'Paid',
          tier: (m.context_length || 0) > 100000 ? 'powerful' as const :
                (m.context_length || 0) > 30000 ? 'balanced' as const : 'fast' as const,
        }));

      this.dynamicModels = models.length > 0 ? models : OPENROUTER_DEFAULT_MODELS;
      this.dynamicModelsFetchedAt = Date.now();
      return this.dynamicModels;
    } catch {
      return OPENROUTER_DEFAULT_MODELS;
    }
  }

  async refreshModels(apiKey?: string): Promise<ProviderModel[]> {
    if (!apiKey) {
      this.dynamicModels = OPENROUTER_DEFAULT_MODELS;
      this.dynamicModelsFetchedAt = Date.now();
      return this.dynamicModels;
    }
    return this.fetchDynamicModels(apiKey);
  }
}
