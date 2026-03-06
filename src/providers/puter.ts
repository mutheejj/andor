import { AIProvider, AIMessage, AIResponse, AIStreamCallbacks, ProviderModel } from './base';

const PUTER_MODELS: ProviderModel[] = [
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', contextWindow: 200000, free: true, bestFor: 'Recommended coding model', tier: 'powerful' },
  { id: 'claude-opus-4', name: 'Claude Opus 4', contextWindow: 200000, free: true, bestFor: 'Most capable model', tier: 'powerful' },
  { id: 'claude-haiku-4', name: 'Claude Haiku 4', contextWindow: 200000, free: true, bestFor: 'Fast & efficient', tier: 'fast' },
  { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, free: true, bestFor: 'Great for code', tier: 'powerful' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, free: true, bestFor: 'Fast', tier: 'fast' },
  { id: 'gpt-4-1', name: 'GPT-4.1', contextWindow: 128000, free: true, bestFor: 'Latest GPT', tier: 'powerful' },
  { id: 'o3-mini', name: 'o3-mini', contextWindow: 128000, free: true, bestFor: 'Reasoning', tier: 'balanced' },
  { id: 'gemini-2-5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1048576, free: true, bestFor: 'Recommended', tier: 'powerful' },
  { id: 'gemini-2-5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1048576, free: true, bestFor: 'Fast', tier: 'fast' },
  { id: 'deepseek-v3', name: 'DeepSeek V3', contextWindow: 131072, free: true, bestFor: 'Open source', tier: 'powerful' },
  { id: 'deepseek-r1', name: 'DeepSeek R1', contextWindow: 163840, free: true, bestFor: 'Reasoning', tier: 'powerful' },
  { id: 'llama-4-maverick', name: 'Llama 4 Maverick', contextWindow: 131072, free: true, bestFor: 'Open source', tier: 'balanced' },
  { id: 'llama-4-scout', name: 'Llama 4 Scout', contextWindow: 131072, free: true, bestFor: 'Open source', tier: 'balanced' },
  { id: 'mistral-large', name: 'Mistral Large', contextWindow: 131072, free: true, bestFor: 'Open source', tier: 'powerful' },
];

/**
 * Puter.js provider — this is a special provider because Puter.js AI calls
 * happen from the webview side (via the Puter.js SDK loaded in the browser).
 * The extension host cannot call Puter directly.
 * 
 * call() and streamCall() are stubs that will throw — the actual Puter streaming
 * is handled by the webview-side lib/puter.ts.
 * 
 * This provider exists so the registry can list Puter models and treat it
 * as the default provider when no API keys are configured.
 */
export class PuterProvider implements AIProvider {
  id = 'puter';
  name = 'Puter.js (Default)';

  async call(_messages: AIMessage[], _model: string, _apiKey: string): Promise<AIResponse> {
    // Puter calls happen in the webview — this is a passthrough marker
    throw new Error('Puter.js calls are handled in the webview. Use the webview bridge.');
  }

  async streamCall(
    _messages: AIMessage[],
    _model: string,
    _apiKey: string,
    callbacks: AIStreamCallbacks,
  ): Promise<void> {
    callbacks.onError('Puter.js calls are handled in the webview. Use the webview bridge.');
  }

  async testConnection(_apiKey: string): Promise<boolean> {
    // Puter is always available if the user is signed in
    return true;
  }

  getModels(): ProviderModel[] {
    return PUTER_MODELS;
  }
}
