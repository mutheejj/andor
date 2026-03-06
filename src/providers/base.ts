export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed?: number;
}

export interface AIStreamCallbacks {
  onChunk: (text: string) => void;
  onDone: (fullText: string, response: AIResponse) => void;
  onError: (error: string) => void;
}

export interface AIProvider {
  id: string;
  name: string;
  call(messages: AIMessage[], model: string, apiKey: string): Promise<AIResponse>;
  streamCall(messages: AIMessage[], model: string, apiKey: string, callbacks: AIStreamCallbacks): Promise<void>;
  testConnection(apiKey: string): Promise<boolean>;
  getModels(): ProviderModel[];
}

export interface ProviderModel {
  id: string;
  name: string;
  contextWindow: number;
  free: boolean;
  bestFor: string;
  tier: 'fast' | 'balanced' | 'powerful';
}

export interface ProviderConfig {
  id: string;
  apiKey: string;
  enabled: boolean;
  priority: number;
}
