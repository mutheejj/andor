import { AIProvider, AIMessage, AIResponse, AIStreamCallbacks, ProviderModel } from './base';

const MISTRAL_MODELS: ProviderModel[] = [
  // === CODING SPECIALISTS ===
  { id: 'codestral-latest', name: 'Codestral (Latest)', contextWindow: 256000, free: false, bestFor: 'Best-in-class code completion & FIM, 80+ languages', tier: 'powerful' },
  { id: 'devstral-latest', name: 'Devstral (Agent)', contextWindow: 131072, free: false, bestFor: 'SWE agent — explores codebases, edits multiple files', tier: 'powerful' },

  // === REASONING ===
  { id: 'magistral-medium-latest', name: 'Magistral Medium', contextWindow: 131072, free: false, bestFor: 'Multi-step reasoning + complex logic', tier: 'powerful' },
  { id: 'magistral-small-latest', name: 'Magistral Small', contextWindow: 131072, free: false, bestFor: 'Fast reasoning', tier: 'balanced' },

  // === GENERAL ===
  { id: 'mistral-large-latest', name: 'Mistral Large', contextWindow: 131072, free: false, bestFor: 'Complex tasks, best Mistral general model', tier: 'powerful' },
  { id: 'mistral-medium-latest', name: 'Mistral Medium 3', contextWindow: 131072, free: false, bestFor: 'Balanced cost/performance', tier: 'balanced' },
  { id: 'mistral-small-latest', name: 'Mistral Small', contextWindow: 131072, free: false, bestFor: 'Lightweight fast tasks', tier: 'fast' },
  { id: 'open-mistral-nemo', name: 'Mistral Nemo (Open)', contextWindow: 131072, free: true, bestFor: 'Free open model', tier: 'fast' },
];

const BASE_URL = 'https://api.mistral.ai/v1/chat/completions';

export class MistralProvider implements AIProvider {
  id = 'mistral';
  name = 'Mistral AI';

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
      throw new Error(`Mistral API error ${resp.status}: ${text || resp.statusText}`);
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
        callbacks.onError(`Mistral API error ${resp.status}: ${text || resp.statusText}`);
        return;
      }

      if (!resp.body) {
        callbacks.onError('No response body from Mistral');
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
      callbacks.onError(`Mistral stream error: ${msg}`);
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
          model: 'open-mistral-nemo',
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
    return MISTRAL_MODELS;
  }
}
