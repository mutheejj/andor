import React from 'react';

interface AgentStep {
  id: string;
  type: 'plan' | 'read' | 'write' | 'run' | 'verify' | 'report';
  status: 'pending' | 'running' | 'done' | 'failed';
  description: string;
  result?: string;
  timestamp: number;
  error?: string;
}

interface TaskTrackerProps {
  steps: AgentStep[];
  taskDescription?: string;
}

const getStepIcon = (type: AgentStep['type']) => {
  switch (type) {
    case 'plan': return '📋';
    case 'read': return '📖';
    case 'write': return '✏️';
    case 'run': return '⚡';
    case 'verify': return '✓';
    case 'report': return '📊';
    default: return '•';
  }
};

const getStatusIcon = (status: AgentStep['status']) => {
  switch (status) {
    case 'done': return '✅';
    case 'running': return '⚡';
    case 'failed': return '✗';
    case 'pending': return '⏳';
    default: return '•';
  }
};

export const TaskTracker: React.FC<TaskTrackerProps> = ({ steps, taskDescription }) => {
  if (steps.length === 0) return null;

  return (
    <div style={{
      border: '1px solid var(--vscode-panel-border)',
      borderRadius: '4px',
      padding: '12px',
      marginBottom: '16px',
      backgroundColor: 'var(--vscode-editor-background)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--vscode-panel-border)'
      }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
          {taskDescription || 'Task Progress'}
        </h3>
        <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
          {steps.filter(s => s.status === 'done').length} / {steps.length} steps
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {steps.map((step, index) => (
          <div
            key={step.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '8px',
              borderRadius: '4px',
              backgroundColor: step.status === 'running' 
                ? 'var(--vscode-list-hoverBackground)'
                : 'transparent',
              opacity: step.status === 'pending' ? 0.6 : 1
            }}
          >
            <span style={{ fontSize: '16px', flexShrink: 0 }}>
              {getStepIcon(step.type)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 500, textTransform: 'uppercase', color: 'var(--vscode-descriptionForeground)' }}>
                  {step.type}
                </span>
                <span style={{ fontSize: '14px' }}>
                  {getStatusIcon(step.status)}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--vscode-foreground)' }}>
                {step.description}
              </div>
              {step.error && (
                <div style={{
                  marginTop: '4px',
                  padding: '6px 8px',
                  backgroundColor: 'var(--vscode-inputValidation-errorBackground)',
                  border: '1px solid var(--vscode-inputValidation-errorBorder)',
                  borderRadius: '3px',
                  fontSize: '12px',
                  color: 'var(--vscode-errorForeground)'
                }}>
                  Error: {step.error}
                </div>
              )}
              {step.status === 'running' && (
                <div style={{
                  marginTop: '4px',
                  fontSize: '12px',
                  color: 'var(--vscode-descriptionForeground)',
                  fontStyle: 'italic'
                }}>
                  In progress...
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
