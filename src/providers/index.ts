import * as vscode from 'vscode';
import { ProviderRegistry } from './registry';
import { PuterProvider } from './puter';
import { NvidiaProvider } from './nvidia';
import { GroqProvider } from './groq';
import { GoogleProvider } from './google';
import { MistralProvider } from './mistral';
import { OpenRouterProvider } from './openrouter';

export { ProviderRegistry } from './registry';
export { PuterProvider } from './puter';
export { NvidiaProvider } from './nvidia';
export { GroqProvider } from './groq';
export { GoogleProvider } from './google';
export { MistralProvider } from './mistral';
export { OpenRouterProvider } from './openrouter';
export type { AIMessage, AIResponse, AIStreamCallbacks, AIProvider, ProviderModel, ProviderConfig } from './base';

let registry: ProviderRegistry | null = null;

export function initializeProviders(context: vscode.ExtensionContext): ProviderRegistry {
  registry = new ProviderRegistry(context);

  // Register all providers — Puter is always first (default)
  registry.register(new PuterProvider());
  registry.register(new NvidiaProvider());
  registry.register(new GroqProvider());
  registry.register(new GoogleProvider());
  registry.register(new MistralProvider());
  registry.register(new OpenRouterProvider());

  return registry;
}

export function getRegistry(): ProviderRegistry {
  if (!registry) {
    throw new Error('Provider registry not initialized. Call initializeProviders() first.');
  }
  return registry;
}

/**
 * Determine if a model belongs to Puter (needs webview-side handling)
 * vs. an external provider (can be called from extension host).
 */
export function isPuterModel(modelSpec: string): boolean {
  if (modelSpec.startsWith('puter::')) { return true; }
  const reg = getRegistry();
  const resolved = reg.resolveModel(modelSpec);
  if (!resolved) { return true; } // Default to Puter for unknown models
  return resolved.provider.id === 'puter';
}
