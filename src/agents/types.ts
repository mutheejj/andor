export type AgentRole =
  | 'orchestrator'
  | 'coder'
  | 'debugger'
  | 'tester'
  | 'reviewer'
  | 'researcher'
  | 'terminal'
  | 'planner';

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'done'
  | 'failed'
  | 'stopped';

export interface AgentConfig {
  id: string;
  role: AgentRole;
  modelSpec: string;
  maxIterations: number;   // default: 20
  maxRuntimeMs: number;    // default: 5 min
  heartbeatIntervalMs: number; // default: 3000
  heartbeatTimeoutMs: number;  // default: 10000
}

export interface AgentTask {
  id: string;
  description: string;
  parentTaskId?: string;
  assignedAgentId?: string;
  dependencies: string[];  // task IDs this depends on
  context: string;
  files?: string[];
  priority: number;        // higher = more important
}

export interface AgentResult {
  agentId: string;
  taskId: string;
  status: 'success' | 'failure' | 'partial' | 'stopped';
  output: string;
  filesModified: string[];
  commandsRun: string[];
  tokensUsed: number;
  durationMs: number;
  error?: string;
}

export interface SubAgentMessage {
  agentId: string;
  type: 'progress' | 'result' | 'error' | 'heartbeat' | 'needs_input';
  content: string;
  filesModified?: string[];
  commandsRun?: string[];
  tokensUsed?: number;
  timestamp: number;
}

export interface AgentHeartbeat {
  agentId: string;
  status: AgentStatus;
  currentStep: string;
  stepsCompleted: number;
  tokensUsed: number;
  timestamp: number;
}

export interface AgentPlan {
  taskId: string;
  steps: AgentPlanStep[];
  createdAt: number;
}

export interface AgentPlanStep {
  id: string;
  description: string;
  assignedRole: AgentRole;
  dependencies: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';
}

export interface Finding {
  agentId: string;
  type: 'info' | 'warning' | 'blocker';
  message: string;
  file?: string;
  timestamp: number;
}

export interface Issue {
  agentId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  file?: string;
  line?: number;
  suggestedFix?: string;
}

export interface Note {
  agentId: string;
  content: string;
  timestamp: number;
}

export interface Decision {
  agentId: string;
  description: string;
  reason: string;
  timestamp: number;
}

export interface SharedMemoryData {
  taskContext: string;
  codebaseMap: string;
  sharedFindings: Finding[];
  completedWork: Record<string, AgentResult>;
  discoveredIssues: Issue[];
  filesModified: string[];
  notes: Note[];
  decisions: Decision[];
}

/** UI-facing agent state for the dashboard */
export interface AgentDashboardState {
  taskDescription: string;
  agents: AgentUIState[];
  totalTokens: number;
  startedAt: number;
  isRunning: boolean;
}

export interface AgentUIState {
  id: string;
  role: AgentRole;
  status: AgentStatus;
  currentStep: string;
  stepsCompleted: number;
  totalSteps: number;
  model: string;
  tokensUsed: number;
  filesModified: string[];
  startedAt: number;
  durationMs: number;
  error?: string;
  result?: string;
}

export const ROLE_ICONS: Record<AgentRole, string> = {
  orchestrator: '👑',
  coder: '💻',
  debugger: '🐛',
  tester: '🧪',
  reviewer: '🔍',
  researcher: '📚',
  terminal: '⚡',
  planner: '📋',
};

export const ROLE_MODEL_PREFERENCES: Record<AgentRole, string[]> = {
  orchestrator: ['nvidia::qwen/qwen3-235b-a22b', 'google::gemini-2.5-pro', 'groq::llama-3.3-70b-versatile'],
  coder:        ['nvidia::qwen/qwen2.5-coder-32b-instruct', 'nvidia::deepseek-ai/deepseek-coder-v2', 'mistral::codestral-latest'],
  debugger:     ['nvidia::deepseek-ai/deepseek-r1', 'nvidia::qwen/qwen2.5-coder-32b-instruct', 'google::gemini-2.5-pro'],
  tester:       ['nvidia::deepseek-ai/deepseek-coder-v2', 'nvidia::qwen/qwen2.5-coder-32b-instruct'],
  reviewer:     ['nvidia::qwen/qwen3-235b-a22b', 'google::gemini-2.5-pro', 'mistral::mistral-large-latest'],
  researcher:   ['google::gemini-2.5-pro', 'groq::llama-3.3-70b-versatile'],
  terminal:     ['groq::llama-3.1-8b-instant', 'google::gemini-2.0-flash'],
  planner:      ['nvidia::qwen/qwen3-235b-a22b', 'nvidia::deepseek-ai/deepseek-r1'],
};
