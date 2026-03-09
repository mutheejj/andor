import * as vscode from 'vscode';
import { AIProvider, AIMessage, AIResponse, AIStreamCallbacks, ProviderModel, ProviderConfig } from './base';

export class ProviderRegistry {
  private providers: Map<string, AIProvider> = new Map();
  private configs: ProviderConfig[] = [];
  private context: vscode.ExtensionContext;
  private modelCache: Map<string, { models: ProviderModel[]; timestamp: number }> = new Map();
  private static readonly CACHE_TTL = 3600000; // 1 hour

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  async getApiKey(providerId: string): Promise<string | undefined> {
    return this.context.secrets.get(`andor.apikey.${providerId}`);
  }

  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    await this.context.secrets.store(`andor.apikey.${providerId}`, apiKey);
  }

  async deleteApiKey(providerId: string): Promise<void> {
    await this.context.secrets.delete(`andor.apikey.${providerId}`);
  }

  async getConfiguredProviders(): Promise<Array<{ provider: AIProvider; hasKey: boolean }>> {
    const result: Array<{ provider: AIProvider; hasKey: boolean }> = [];
    for (const provider of this.providers.values()) {
      if (provider.id === 'puter') {
        result.push({ provider, hasKey: true });
        continue;
      }
      const key = await this.getApiKey(provider.id);
      result.push({ provider, hasKey: Boolean(key) });
    }
    return result;
  }

  getModelsForProvider(providerId: string): ProviderModel[] {
    const cached = this.modelCache.get(providerId);
    if (cached && Date.now() - cached.timestamp < ProviderRegistry.CACHE_TTL) {
      return cached.models;
    }
    const provider = this.providers.get(providerId);
    if (!provider) { return []; }
    const models = provider.getModels();
    this.modelCache.set(providerId, { models, timestamp: Date.now() });
    return models;
  }

  getAllModels(): Array<{ provider: AIProvider; model: ProviderModel }> {
    const result: Array<{ provider: AIProvider; model: ProviderModel }> = [];
    for (const provider of this.providers.values()) {
      const models = this.getModelsForProvider(provider.id);
      for (const model of models) {
        result.push({ provider, model });
      }
    }
    return result;
  }

  /**
   * Find which provider owns a given model ID.
   * Format: "providerId::modelId" or just "modelId" (searches all providers).
   */
  resolveModel(modelSpec: string): { provider: AIProvider; modelId: string } | undefined {
    if (modelSpec.includes('::')) {
      const [providerId, modelId] = modelSpec.split('::', 2);
      const provider = this.providers.get(providerId);
      if (provider) {
        return { provider, modelId };
      }
    }

    const providerPrefix = modelSpec.includes('/') ? modelSpec.split('/', 1)[0] : '';
    const providerByPrefix = providerPrefix ? this.providers.get(providerPrefix) : undefined;
    if (providerByPrefix) {
      const providerModels = this.getModelsForProvider(providerByPrefix.id);
      if (providerModels.some((model) => model.id === modelSpec)) {
        return { provider: providerByPrefix, modelId: modelSpec };
      }
    }

    const exactMatches: Array<{ provider: AIProvider; modelId: string }> = [];
    // Search all providers for the model
    for (const provider of this.providers.values()) {
      const models = this.getModelsForProvider(provider.id);
      if (models.some(m => m.id === modelSpec)) {
        exactMatches.push({ provider, modelId: modelSpec });
      }
    }

    if (exactMatches.length === 1) {
      return exactMatches[0];
    }

    if (exactMatches.length > 1) {
      const preferredOrder = ['openrouter', 'openai', 'anthropic', 'google', 'nvidia', 'puter'];
      for (const providerId of preferredOrder) {
        const found = exactMatches.find((match) => match.provider.id === providerId);
        if (found) {
          return found;
        }
      }
      return exactMatches[0];
    }

    return undefined;
  }

  async call(
    messages: AIMessage[],
    modelSpec: string,
    fallbackProviderIds?: string[],
  ): Promise<AIResponse> {
    const resolved = this.resolveModel(modelSpec);
    if (!resolved) {
      throw new Error(`Unknown model: ${modelSpec}`);
    }

    const { provider, modelId } = resolved;
    const apiKey = provider.id === 'puter' ? 'puter' : await this.getApiKey(provider.id);
    if (!apiKey) {
      throw new Error(`No API key configured for ${provider.name}`);
    }

    try {
      return await provider.call(messages, modelId, apiKey);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isRetryable = errorMsg.includes('429') || errorMsg.includes('5') && errorMsg.includes('00');

      if (isRetryable && fallbackProviderIds && fallbackProviderIds.length > 0) {
        for (const fallbackId of fallbackProviderIds) {
          const fallbackProvider = this.providers.get(fallbackId);
          if (!fallbackProvider || fallbackProvider.id === provider.id) { continue; }
          const fallbackKey = fallbackProvider.id === 'puter' ? 'puter' : await this.getApiKey(fallbackProvider.id);
          if (!fallbackKey) { continue; }

          const fallbackModels = fallbackProvider.getModels();
          if (fallbackModels.length === 0) { continue; }

          try {
            vscode.window.showInformationMessage(
              `Primary provider rate limited, trying ${fallbackProvider.name}...`
            );
            return await fallbackProvider.call(messages, fallbackModels[0].id, fallbackKey);
          } catch {
            continue;
          }
        }
      }

      throw err;
    }
  }

  async streamCall(
    messages: AIMessage[],
    modelSpec: string,
    callbacks: AIStreamCallbacks,
    fallbackProviderIds?: string[],
  ): Promise<void> {
    const resolved = this.resolveModel(modelSpec);
    if (!resolved) {
      callbacks.onError(`Unknown model: ${modelSpec}`);
      return;
    }

    const { provider, modelId } = resolved;
    const apiKey = provider.id === 'puter' ? 'puter' : await this.getApiKey(provider.id);
    if (!apiKey) {
      callbacks.onError(`No API key configured for ${provider.name}`);
      return;
    }

    try {
      await provider.streamCall(messages, modelId, apiKey, callbacks);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isRetryable = errorMsg.includes('429') || /5\d{2}/.test(errorMsg);

      if (isRetryable && fallbackProviderIds && fallbackProviderIds.length > 0) {
        for (const fallbackId of fallbackProviderIds) {
          const fallbackProvider = this.providers.get(fallbackId);
          if (!fallbackProvider || fallbackProvider.id === provider.id) { continue; }
          const fallbackKey = fallbackProvider.id === 'puter' ? 'puter' : await this.getApiKey(fallbackProvider.id);
          if (!fallbackKey) { continue; }

          const fallbackModels = fallbackProvider.getModels();
          if (fallbackModels.length === 0) { continue; }

          try {
            vscode.window.showInformationMessage(
              `Primary provider rate limited, trying ${fallbackProvider.name}...`
            );
            await fallbackProvider.streamCall(messages, fallbackModels[0].id, fallbackKey, callbacks);
            return;
          } catch {
            continue;
          }
        }
      }

      callbacks.onError(errorMsg);
    }
  }

  async testProvider(providerId: string): Promise<boolean> {
    const provider = this.providers.get(providerId);
    if (!provider) { return false; }
    if (provider.id === 'puter') { return true; }
    const apiKey = await this.getApiKey(providerId);
    if (!apiKey) { return false; }
    try {
      return await provider.testConnection(apiKey);
    } catch {
      return false;
    }
  }
}
