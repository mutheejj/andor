import React, { useState } from 'react';

interface LearnedFact {
  fact: string;
  confidence: number;
  timestamp: number;
}

interface UserPreference {
  key: string;
  value: string;
  timestamp: number;
}

interface TaskSummary {
  id: string;
  description: string;
  filesChanged: string[];
  timestamp: number;
  success: boolean;
}

interface TechStack {
  languages: string[];
  frameworks: string[];
  buildTools: string[];
  packageManager?: string;
  runtime?: string;
}

interface MemoryPanelProps {
  techStack?: TechStack;
  learnedFacts: LearnedFact[];
  userPreferences: UserPreference[];
  taskHistory: TaskSummary[];
  onClearMemory?: () => void;
}

export const MemoryPanel: React.FC<MemoryPanelProps> = ({
  techStack,
  learnedFacts,
  userPreferences,
  taskHistory,
  onClearMemory
}) => {
  const [expanded, setExpanded] = useState(false);

  const formatTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div style={{
      border: '1px solid var(--vscode-panel-border)',
      borderRadius: '4px',
      marginBottom: '16px',
      backgroundColor: 'var(--vscode-editor-background)'
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '12px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: expanded ? '1px solid var(--vscode-panel-border)' : 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>
            Project Memory
          </span>
          <span style={{
            fontSize: '12px',
            padding: '2px 8px',
            borderRadius: '10px',
            backgroundColor: 'var(--vscode-badge-background)',
            color: 'var(--vscode-badge-foreground)'
          }}>
            {learnedFacts.length + userPreferences.length + taskHistory.length} items
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onClearMemory && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearMemory();
              }}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                backgroundColor: 'transparent',
                border: '1px solid var(--vscode-button-border)',
                borderRadius: '3px',
                color: 'var(--vscode-foreground)',
                cursor: 'pointer'
              }}
            >
              Clear All
            </button>
          )}
          <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
            {expanded ? '▼' : '▶'}
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '12px' }}>
          {techStack && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>
                Tech Stack
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                {techStack.languages.length > 0 && (
                  <div>
                    <span style={{ color: 'var(--vscode-descriptionForeground)' }}>Languages:</span>{' '}
                    {techStack.languages.join(', ')}
                  </div>
                )}
                {techStack.frameworks.length > 0 && (
                  <div>
                    <span style={{ color: 'var(--vscode-descriptionForeground)' }}>Frameworks:</span>{' '}
                    {techStack.frameworks.join(', ')}
                  </div>
                )}
                {techStack.buildTools.length > 0 && (
                  <div>
                    <span style={{ color: 'var(--vscode-descriptionForeground)' }}>Build Tools:</span>{' '}
                    {techStack.buildTools.join(', ')}
                  </div>
                )}
                {techStack.packageManager && (
                  <div>
                    <span style={{ color: 'var(--vscode-descriptionForeground)' }}>Package Manager:</span>{' '}
                    {techStack.packageManager}
                  </div>
                )}
                {techStack.runtime && (
                  <div>
                    <span style={{ color: 'var(--vscode-descriptionForeground)' }}>Runtime:</span>{' '}
                    {techStack.runtime}
                  </div>
                )}
              </div>
            </div>
          )}

          {learnedFacts.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>
                💡 Learned Facts
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {learnedFacts.slice(0, 5).map((fact, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '6px 8px',
                      backgroundColor: 'var(--vscode-list-hoverBackground)',
                      borderRadius: '3px',
                      fontSize: '12px'
                    }}
                  >
                    {fact.fact}
                  </div>
                ))}
                {learnedFacts.length > 5 && (
                  <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', paddingLeft: '8px' }}>
                    ... and {learnedFacts.length - 5} more
                  </div>
                )}
              </div>
            </div>
          )}

          {userPreferences.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>
                User Preferences
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {userPreferences.map((pref, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '6px 8px',
                      backgroundColor: 'var(--vscode-list-hoverBackground)',
                      borderRadius: '3px',
                      fontSize: '12px'
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{pref.key}:</span> {pref.value}
                  </div>
                ))}
              </div>
            </div>
          )}

          {taskHistory.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>
                Recent Tasks
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {taskHistory.slice(0, 3).map((task, index) => (
                  <div
                    key={task.id}
                    style={{
                      padding: '6px 8px',
                      backgroundColor: 'var(--vscode-list-hoverBackground)',
                      borderRadius: '3px',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <span>{task.success ? '✅' : '❌'}</span>
                      <span style={{ flex: 1 }}>{task.description}</span>
                      <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
                        {formatTimeAgo(task.timestamp)}
                      </span>
                    </div>
                    {task.filesChanged.length > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', marginLeft: '22px' }}>
                        {task.filesChanged.length} {task.filesChanged.length === 1 ? 'file' : 'files'} changed
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {learnedFacts.length === 0 && userPreferences.length === 0 && taskHistory.length === 0 && (
            <div style={{
              padding: '16px',
              textAlign: 'center',
              color: 'var(--vscode-descriptionForeground)',
              fontSize: '12px'
            }}>
              No project memory yet. Andor will learn as you work together.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
