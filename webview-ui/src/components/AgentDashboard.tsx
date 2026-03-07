import React from 'react';
import { AgentCard } from './AgentCard';
import { StopButton } from './StopButton';

export interface AgentUIState {
  id: string;
  role: string;
  status: string;
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

export interface AgentDashboardState {
  taskDescription: string;
  agents: AgentUIState[];
  totalTokens: number;
  startedAt: number;
  isRunning: boolean;
}

interface AgentDashboardProps {
  state: AgentDashboardState;
  onStop: () => void;
  onResume?: () => void;
}

const ROLE_ICONS: Record<string, string> = {
  orchestrator: '👑',
  coder: '💻',
  debugger: '🐛',
  tester: '🧪',
  reviewer: '🔍',
  researcher: '📚',
  terminal: '⚡',
  planner: '📋',
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function AgentDashboard({ state, onStop, onResume }: AgentDashboardProps) {
  if (!state || state.agents.length === 0) return null;

  const runtime = state.isRunning
    ? Date.now() - state.startedAt
    : state.agents.reduce((max, a) => Math.max(max, a.durationMs), 0);

  const wasStopped = !state.isRunning && state.agents.some(a => a.status === 'stopped');

  return (
    <div
      className="rounded-md overflow-hidden my-2 text-[11px]"
      style={{
        border: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-editorWidget-background, #1e1e1e)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: 'var(--vscode-sideBarSectionHeader-background)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🤖</span>
          <span className="font-bold text-xs">Andor Agent System</span>
          {state.isRunning && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {state.isRunning && <StopButton onStop={onStop} />}
          {wasStopped && onResume && (
            <button
              onClick={onResume}
              className="px-2 py-0.5 rounded text-[10px] font-medium"
              style={{
                background: 'var(--vscode-button-background)',
                color: 'var(--vscode-button-foreground)',
              }}
            >
              ▶ Resume
            </button>
          )}
        </div>
      </div>

      {/* Task description */}
      <div className="px-3 py-1.5 opacity-60 truncate" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
        Task: {state.taskDescription.substring(0, 80)}{state.taskDescription.length > 80 ? '...' : ''}
      </div>

      {/* Agent list */}
      <div className="px-2 py-1.5">
        {state.agents.map((agent, i) => (
          <AgentCard key={agent.id} agent={agent} isFirst={i === 0} />
        ))}
      </div>

      {/* Footer stats */}
      <div
        className="flex items-center justify-between px-3 py-1.5 text-[9px] opacity-50"
        style={{ borderTop: '1px solid var(--vscode-panel-border)' }}
      >
        <span>Total tokens: {formatTokens(state.totalTokens)}</span>
        <span>Runtime: {formatDuration(runtime)}</span>
        <span>{state.agents.length} agent{state.agents.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
