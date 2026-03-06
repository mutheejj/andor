import { AIProvider, AIMessage, AIResponse, AIStreamCallbacks, ProviderModel } from './base';

const GOOGLE_MODELS: ProviderModel[] = [
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1048576, free: true, bestFor: 'Largest context (1M tokens), best for entire codebases', tier: 'powerful' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1048576, free: true, bestFor: 'Fast + 1M context', tier: 'fast' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1048576, free: true, bestFor: 'Multimodal + code', tier: 'fast' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 2000000, free: true, bestFor: '2M token context', tier: 'powerful' },
];

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function buildGeminiMessages(messages: AIMessage[]): { contents: unknown[]; systemInstruction?: unknown } {
  const systemMessages = messages.filter(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const contents = chatMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const result: { contents: unknown[]; systemInstruction?: unknown } = { contents };

  if (systemMessages.length > 0) {
    result.systemInstruction = {
      parts: [{ text: systemMessages.map(m => m.content).join('\n\n') }],
    };
  }

  return result;
}

export class GoogleProvider implements AIProvider {
  id = 'google';
  name = 'Google Gemini';

  async call(messages: AIMessage[], model: string, apiKey: string): Promise<AIResponse> {
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;
    const body = buildGeminiMessages(messages);

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Google API error ${resp.status}: ${text || resp.statusText}`);
    }

    const data = await resp.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { totalTokenCount?: number };
    };

    const content = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    return {
      content,
      model,
      provider: this.id,
      tokensUsed: data?.usageMetadata?.totalTokenCount,
    };
  }

  async streamCall(
    messages: AIMessage[],
    model: string,
    apiKey: string,
    callbacks: AIStreamCallbacks,
  ): Promise<void> {
    const url = `${BASE_URL}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const body = buildGeminiMessages(messages);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        callbacks.onError(`Google API error ${resp.status}: ${text || resp.statusText}`);
        return;
      }

      if (!resp.body) {
        callbacks.onError('No response body from Google');
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
          if (!data) { continue; }
          try {
            const json = JSON.parse(data) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            const parts = json?.candidates?.[0]?.content?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) {
                  fullText += part.text;
                  callbacks.onChunk(fullText);
                }
              }
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      callbacks.onDone(fullText, { content: fullText, model, provider: this.id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      callbacks.onError(`Google stream error: ${msg}`);
    }
  }

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const url = `${BASE_URL}?key=${apiKey}`;
      const resp = await fetch(url);
      return resp.ok;
    } catch {
      return false;
    }
  }

  getModels(): ProviderModel[] {
    return GOOGLE_MODELS;
  }
}
