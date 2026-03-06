import { AIProvider, AIMessage, AIResponse, AIStreamCallbacks, ProviderModel } from './base';

const GROQ_MODELS: ProviderModel[] = [
  // === PRODUCTION MODELS ===
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', contextWindow: 131072, free: true, bestFor: 'Best general coding', tier: 'powerful' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', contextWindow: 131072, free: true, bestFor: 'Ultra-fast responses', tier: 'fast' },
  { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', contextWindow: 131072, free: true, bestFor: 'OpenAI open weight powerhouse', tier: 'powerful' },
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', contextWindow: 131072, free: true, bestFor: 'Balanced GPT open weight', tier: 'balanced' },

  // === PREVIEW MODELS ===
  { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick 17B', contextWindow: 131072, free: true, bestFor: 'Latest Llama 4', tier: 'balanced' },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', contextWindow: 131072, free: true, bestFor: 'Vision + coding', tier: 'balanced' },
  { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2', contextWindow: 131072, free: true, bestFor: 'Tool use + agentic', tier: 'powerful' },
  { id: 'qwen/qwen-3-32b', name: 'Qwen 3 32B', contextWindow: 32768, free: true, bestFor: 'Strong coding + reasoning', tier: 'balanced' },
  { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B', contextWindow: 131072, free: true, bestFor: 'Fast chain-of-thought', tier: 'balanced' },

  // === COMPOUND ===
  { id: 'groq/compound', name: 'Groq Compound (Tools)', contextWindow: 131072, free: true, bestFor: 'Search + code execution built-in', tier: 'powerful' },
];

const BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

export class GroqProvider implements AIProvider {
  id = 'groq';
  name = 'Groq';

  async call(messages: AIMessage[], model: string, apiKey: string): Promise<AIResponse> {
    const resp = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Groq API error ${resp.status}: ${text || resp.statusText}`);
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
        },
        body: JSON.stringify({
          model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        callbacks.onError(`Groq API error ${resp.status}: ${text || resp.statusText}`);
        return;
      }

      if (!resp.body) {
        callbacks.onError('No response body from Groq');
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
      callbacks.onError(`Groq stream error: ${msg}`);
    }
  }

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const resp = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  getModels(): ProviderModel[] {
    return GROQ_MODELS;
  }
}
