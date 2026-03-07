import React, { useState } from 'react';
import type { AgentUIState } from './AgentDashboard';

interface AgentCardProps {
  agent: AgentUIState;
  isFirst: boolean;
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

const STATUS_STYLES: Record<string, { color: string; label: string; animate?: boolean }> = {
  idle:     { color: '#6d6d6d', label: 'IDLE' },
  thinking: { color: '#4fc1ff', label: 'THINKING', animate: true },
  working:  { color: '#4fc1ff', label: 'WORKING', animate: true },
  waiting:  { color: '#6d6d6d', label: 'WAITING' },
  done:     { color: '#4ec9b0', label: 'DONE' },
  failed:   { color: '#f48771', label: 'FAILED' },
  stopped:  { color: '#cca700', label: 'STOPPED' },
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export function AgentCard({ agent, isFirst }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const icon = ROLE_ICONS[agent.role] ?? '🤖';
  const statusStyle = STATUS_STYLES[agent.status] ?? STATUS_STYLES.idle;
  const progress = agent.totalSteps > 0
    ? Math.round((agent.stepsCompleted / agent.totalSteps) * 100)
    : 0;

  return (
    <div
      className="py-1.5 cursor-pointer"
      style={{ borderTop: isFirst ? 'none' : '1px solid var(--vscode-panel-border)' }}
      onClick={() => setExpanded(v => !v)}
    >
      {/* Main row */}
      <div className="flex items-center gap-2">
        {/* Tree connector */}
        {!isFirst && (
          <span className="opacity-30 text-[10px] flex-shrink-0">├─</span>
        )}

        {/* Icon + Role */}
        <span className="flex-shrink-0">{icon}</span>
        <span className="font-medium capitalize flex-shrink-0 text-[10px]">
          {agent.role} Agent
        </span>

        {/* Current step */}
        <span className="opacity-50 truncate text-[9px] flex-1">
          [{agent.currentStep || agent.status}]
        </span>

        {/* Status dot + label */}
        <span className="flex items-center gap-1 flex-shrink-0">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${statusStyle.animate ? 'animate-pulse' : ''}`}
            style={{ background: statusStyle.color }}
          />
          <span className="text-[8px] font-bold" style={{ color: statusStyle.color }}>
            {statusStyle.label}
          </span>
        </span>
      </div>

      {/* Progress bar (only for working/thinking agents) */}
      {(agent.status === 'working' || agent.status === 'thinking') && agent.stepsCompleted > 0 && (
        <div className="mt-1 ml-6 flex items-center gap-2">
          <div
            className="flex-1 h-1 rounded-full overflow-hidden"
            style={{ background: 'var(--vscode-progressBar-background, #333)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: statusStyle.color,
              }}
            />
          </div>
          <span className="text-[8px] opacity-40 flex-shrink-0">
            Step {agent.stepsCompleted} of {agent.totalSteps}
          </span>
        </div>
      )}

      {/* Files modified hint */}
      {agent.filesModified.length > 0 && !expanded && (
        <div className="mt-0.5 ml-6 text-[9px] opacity-40 truncate">
          {agent.filesModified[0]}{agent.filesModified.length > 1 ? ` +${agent.filesModified.length - 1} more` : ''}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div
          className="mt-1.5 ml-6 p-2 rounded text-[9px]"
          style={{ background: 'var(--vscode-input-background)' }}
        >
          {agent.model && (
            <div className="flex justify-between mb-1">
              <span className="opacity-50">Model:</span>
              <span>{agent.model}</span>
            </div>
          )}
          <div className="flex justify-between mb-1">
            <span className="opacity-50">Tokens:</span>
            <span>{agent.tokensUsed.toLocaleString()}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="opacity-50">Duration:</span>
            <span>{formatDuration(agent.durationMs)}</span>
          </div>
          {agent.filesModified.length > 0 && (
            <div className="mt-1">
              <span className="opacity-50">Files modified:</span>
              <div className="mt-0.5">
                {agent.filesModified.map((f, i) => (
                  <div key={i} className="opacity-70 truncate">• {f}</div>
                ))}
              </div>
            </div>
          )}
          {agent.error && (
            <div className="mt-1 text-red-400">
              Error: {agent.error}
            </div>
          )}
          {agent.result && (
            <div className="mt-1 opacity-70 line-clamp-3">
              {agent.result}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
