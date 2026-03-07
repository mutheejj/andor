export type TaskType =
  | 'debug' | 'refactor' | 'create' | 'explain'
  | 'test'  | 'review'   | 'other';

export type Provider =
  | 'nvidia' | 'groq' | 'google'
  | 'mistral' | 'openrouter' | 'puter';

export interface FeedbackEvent {
  sessionId: string;
  modelId: string;
  provider: Provider;
  taskType: TaskType;
  language?: string;
  framework?: string;
  accepted: boolean;
  filesModified?: number;
  responseTokens?: number;
  timeToResponseMs?: number;
  hadErrorsBefore?: boolean;
  errorsResolved?: boolean;
  andorVersion: string;
}

export interface UsageEvent {
  sessionId: string;
  eventType:
    | 'task_started' | 'task_completed' | 'task_failed'
    | 'command_approved' | 'command_denied'
    | 'file_accepted' | 'file_rejected'
    | 'provider_fallback' | 'rate_limit_hit';
  taskType?: TaskType;
  language?: string;
  framework?: string;
  modelUsed?: string;
  provider?: Provider;
  filesCount?: number;
  commandsCount?: number;
  durationMs?: number;
  success?: boolean;
  andorVersion: string;
}

export interface ErrorSolutionEvent {
  errorPattern: string;
  errorCode?: string;
  errorSource?: string;
  language: string;
  framework?: string;
  fixStrategy?: string;
  modelUsed: string;
  solutionAccepted: boolean;
  attemptsNeeded?: number;
}

export interface ModelRecommendation {
  modelId: string;
  provider: Provider;
  acceptanceRate: number;
  sampleCount: number;
  confidence: 'high' | 'medium' | 'low';
  runnerUp?: string;
}

export interface LearningConfig {
  enabled: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  sessionId: string;
  sessionCreatedAt: number;
}
