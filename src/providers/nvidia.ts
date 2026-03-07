import { AIProvider, AIMessage, AIResponse, AIStreamCallbacks, ProviderModel } from './base';

const NVIDIA_MODELS: ProviderModel[] = [
  // === CODING SPECIALISTS ===
  { id: 'qwen/qwen2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', contextWindow: 131072, free: true, bestFor: 'Complex code generation', tier: 'powerful' },
  { id: 'deepseek-ai/deepseek-coder-v2', name: 'DeepSeek Coder V2', contextWindow: 131072, free: true, bestFor: 'Multi-language coding', tier: 'powerful' },
  { id: 'mistralai/codestral-22b-instruct-v0.1', name: 'Codestral 22B', contextWindow: 32768, free: true, bestFor: 'Code completion & FIM', tier: 'balanced' },
  { id: 'mistralai/devstral-small-2505', name: 'Devstral Small', contextWindow: 131072, free: true, bestFor: 'Advanced coding agent tasks', tier: 'powerful' },

  // === LLAMA FAMILY ===
  { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', contextWindow: 131072, free: true, bestFor: 'General coding & reasoning', tier: 'powerful' },
  { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', contextWindow: 131072, free: true, bestFor: 'Most complex tasks', tier: 'powerful' },
  { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', contextWindow: 131072, free: true, bestFor: 'Fast lightweight tasks', tier: 'fast' },
  { id: 'meta/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', contextWindow: 131072, free: true, bestFor: 'Multimodal + coding', tier: 'balanced' },
  { id: 'meta/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick 17B', contextWindow: 131072, free: true, bestFor: 'Balanced performance', tier: 'balanced' },

  // === REASONING MODELS ===
  { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek R1', contextWindow: 163840, free: true, bestFor: 'Complex multi-step reasoning', tier: 'powerful' },
  { id: 'deepseek-ai/deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B', contextWindow: 131072, free: true, bestFor: 'Fast reasoning', tier: 'balanced' },
  { id: 'moonshot-ai/kimi-k2-thinking', name: 'Kimi K2 Thinking', contextWindow: 256000, free: true, bestFor: 'Long-context reasoning + tools', tier: 'powerful' },

  // === NVIDIA NEMOTRON ===
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B', contextWindow: 131072, free: true, bestFor: 'Agentic tasks', tier: 'powerful' },
  { id: 'nvidia/nemotron-4-340b-instruct', name: 'Nemotron 4 340B', contextWindow: 4096, free: true, bestFor: 'Largest NVIDIA model', tier: 'powerful' },

  // === MISTRAL ON NIM ===
  { id: 'mistralai/mistral-large-2-instruct', name: 'Mistral Large 2', contextWindow: 131072, free: true, bestFor: 'Complex instructions', tier: 'powerful' },
  { id: 'mistralai/mixtral-8x22b-instruct-v0.1', name: 'Mixtral 8x22B', contextWindow: 65536, free: true, bestFor: 'MoE efficiency', tier: 'balanced' },

  // === QWEN FAMILY ===
  { id: 'qwen/qwen3-235b-a22b', name: 'Qwen3 235B MoE', contextWindow: 131072, free: true, bestFor: 'Largest Qwen, best reasoning', tier: 'powerful' },
  { id: 'qwen/qwen2.5-72b-instruct', name: 'Qwen 2.5 72B', contextWindow: 131072, free: true, bestFor: 'General purpose', tier: 'powerful' },

  // === MINIMAX ===
  { id: 'minimax/minimax-m2.5', name: 'MiniMax M2.5 230B', contextWindow: 1000000, free: true, bestFor: 'Massive context window', tier: 'powerful' },
];

const BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

export class NvidiaProvider implements AIProvider {
  id = 'nvidia';
  name = 'NVIDIA NIM';

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
      throw new Error(`NVIDIA API error ${resp.status}: ${text || resp.statusText}`);
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
        callbacks.onError(`NVIDIA API error ${resp.status}: ${text || resp.statusText}`);
        return;
      }

      if (!resp.body) {
        callbacks.onError('No response body from NVIDIA');
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
      callbacks.onError(`NVIDIA stream error: ${msg}`);
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
          model: 'meta/llama-3.1-8b-instruct',
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
    return NVIDIA_MODELS;
  }
}
