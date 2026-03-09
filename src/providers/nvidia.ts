import { AIProvider, AIMessage, AIResponse, AIStreamCallbacks, ProviderModel } from './base';

// Fallback models in case API fetch fails
const FALLBACK_NVIDIA_MODELS: ProviderModel[] = [
  { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', contextWindow: 131072, free: true, bestFor: 'General coding & reasoning', tier: 'powerful' },
  { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', contextWindow: 131072, free: true, bestFor: 'Fast lightweight tasks', tier: 'fast' },
  { id: 'meta/llama-3.2-90b-vision-instruct', name: 'Llama 3.2 90B Vision', contextWindow: 128000, free: true, bestFor: 'Images, screenshots, multimodal', tier: 'powerful' },
  { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', contextWindow: 131072, free: true, bestFor: 'Most complex tasks', tier: 'powerful' },
  { id: 'qwen/qwen2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', contextWindow: 131072, free: true, bestFor: 'Code generation', tier: 'powerful' },
  { id: 'qwen/qwen2.5-72b-instruct', name: 'Qwen 2.5 72B', contextWindow: 131072, free: true, bestFor: 'General purpose', tier: 'powerful' },
  { id: 'mistralai/mixtral-8x22b-instruct-v0.1', name: 'Mixtral 8x22B', contextWindow: 65536, free: true, bestFor: 'MoE efficiency', tier: 'balanced' },
];

const BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODELS_API_URL = 'https://models.dev/api.json';

interface ModelsDevModel {
  id: string;
  name: string;
  limit: { context: number; output?: number };
  cost?: { input: number; output: number };
  release_date?: string;
  status?: 'alpha' | 'beta' | 'deprecated' | 'active';
}

interface ModelsDevProvider {
  id: string;
  name: string;
  api?: string;
  models: Record<string, ModelsDevModel>;
}

export class NvidiaProvider implements AIProvider {
  id = 'nvidia';
  name = 'NVIDIA NIM';
  private dynamicModels: ProviderModel[] | null = null;
  private modelsFetchedAt = 0;
  private static readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  private async fetchModelsFromAPI(): Promise<ProviderModel[]> {
    try {
      const response = await fetch(MODELS_API_URL, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json() as Record<string, ModelsDevProvider>;
      const nvidiaProvider = data['nvidia'];
      
      if (!nvidiaProvider || !nvidiaProvider.models) {
        throw new Error('NVIDIA provider not found in models API');
      }

      const models: ProviderModel[] = [];
      
      for (const [modelId, model] of Object.entries(nvidiaProvider.models)) {
        // Skip deprecated models
        if (model.status === 'deprecated') continue;
        
        // Determine tier based on context window
        const contextWindow = model.limit?.context || 4096;
        let tier: 'fast' | 'balanced' | 'powerful' = 'balanced';
        if (contextWindow >= 100000) tier = 'powerful';
        else if (modelId.includes('8b') || modelId.includes('nano')) tier = 'fast';
        
        models.push({
          id: modelId,
          name: model.name || modelId,
          contextWindow,
          free: model.cost?.input === 0 || !model.cost,
          bestFor: this.inferBestFor(modelId, model.name),
          tier,
        });
      }

      // Sort by tier: powerful first, then balanced, then fast
      const tierOrder = { powerful: 0, balanced: 1, fast: 2 };
      models.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);

      return models.length > 0 ? models : FALLBACK_NVIDIA_MODELS;
    } catch (error) {
      console.error('[NVIDIA] Failed to fetch dynamic models:', error);
      return FALLBACK_NVIDIA_MODELS;
    }
  }

  private inferBestFor(modelId: string, modelName?: string): string {
    const id = modelId.toLowerCase();
    const name = (modelName || '').toLowerCase();
    
    if (id.includes('vision') || name.includes('vision')) return 'Images, screenshots, multimodal';
    if (id.includes('coder') || name.includes('coder')) return 'Code generation';
    if (id.includes('405b')) return 'Most complex tasks';
    if (id.includes('70b') || id.includes('72b')) return 'General coding & reasoning';
    if (id.includes('8b')) return 'Fast lightweight tasks';
    if (id.includes('nemotron')) return 'NVIDIA optimized';
    if (id.includes('mixtral') || id.includes('moe')) return 'MoE efficiency';
    
    return 'General purpose';
  }

  private async ensureModelsLoaded(): Promise<ProviderModel[]> {
    const now = Date.now();
    
    // Use cached models if fresh
    if (this.dynamicModels && (now - this.modelsFetchedAt) < NvidiaProvider.CACHE_TTL) {
      return this.dynamicModels;
    }

    // Fetch fresh models
    this.dynamicModels = await this.fetchModelsFromAPI();
    this.modelsFetchedAt = now;
    
    return this.dynamicModels;
  }

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
      const models = await this.ensureModelsLoaded();
      const testModel = models.find(m => m.id.includes('8b'))?.id || models[0]?.id || 'meta/llama-3.1-8b-instruct';
      
      const resp = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: testModel,
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
    // Return cached models if available, otherwise fallback
    if (this.dynamicModels) {
      return this.dynamicModels;
    }
    
    // Trigger async load for next time
    this.ensureModelsLoaded().catch(() => {});
    
    return FALLBACK_NVIDIA_MODELS;
  }

  // Public method to force refresh models
  async refreshModels(): Promise<ProviderModel[]> {
    this.dynamicModels = null;
    return this.ensureModelsLoaded();
  }
}
