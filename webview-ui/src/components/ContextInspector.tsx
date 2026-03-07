import React, { useState } from 'react';

interface ContextFile {
  path: string;
  reason: string;
  tokens: number;
  truncated: boolean;
}

interface ContextInspectorProps {
  repoMapTokens: number;
  files: ContextFile[];
  diagnosticsTokens: number;
  diagnosticsCount: number;
  recentChangesTokens: number;
  recentChangesCount: number;
  totalTokens: number;
  droppedFiles: string[];
}

export const ContextInspector: React.FC<ContextInspectorProps> = ({
  repoMapTokens,
  files,
  diagnosticsTokens,
  diagnosticsCount,
  recentChangesTokens,
  recentChangesCount,
  totalTokens,
  droppedFiles
}) => {
  const [expanded, setExpanded] = useState(false);

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
            Context sent to AI
          </span>
          <span style={{
            fontSize: '12px',
            padding: '2px 8px',
            borderRadius: '10px',
            backgroundColor: 'var(--vscode-badge-background)',
            color: 'var(--vscode-badge-foreground)'
          }}>
            {totalTokens.toLocaleString()} tokens
          </span>
        </div>
        <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
          {expanded ? '▼' : '▶'}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <ContextItem
              icon="📁"
              label="Repo Map"
              tokens={repoMapTokens}
            />

            {files.map((file, index) => (
              <ContextItem
                key={index}
                icon="📄"
                label={file.path.split('/').pop() || file.path}
                tokens={file.tokens}
                subtitle={file.reason}
                truncated={file.truncated}
              />
            ))}

            {diagnosticsCount > 0 && (
              <ContextItem
                icon="⚠️"
                label={`Diagnostics (${diagnosticsCount} ${diagnosticsCount === 1 ? 'error' : 'errors'})`}
                tokens={diagnosticsTokens}
              />
            )}

            {recentChangesCount > 0 && (
              <ContextItem
                icon="🕒"
                label={`Recent changes (${recentChangesCount} ${recentChangesCount === 1 ? 'file' : 'files'})`}
                tokens={recentChangesTokens}
              />
            )}
          </div>

          {droppedFiles.length > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '8px',
              backgroundColor: 'var(--vscode-inputValidation-warningBackground)',
              border: '1px solid var(--vscode-inputValidation-warningBorder)',
              borderRadius: '3px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                {droppedFiles.length} files dropped (context limit)
              </div>
              <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
                {droppedFiles.slice(0, 3).map(f => f.split('/').pop()).join(', ')}
                {droppedFiles.length > 3 && ` and ${droppedFiles.length - 3} more`}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ContextItemProps {
  icon: string;
  label: string;
  tokens: number;
  subtitle?: string;
  truncated?: boolean;
}

const ContextItem: React.FC<ContextItemProps> = ({ icon, label, tokens, subtitle, truncated }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 8px',
    borderRadius: '3px',
    backgroundColor: 'var(--vscode-list-hoverBackground)'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: '14px' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
          {truncated && <span style={{ color: 'var(--vscode-descriptionForeground)', marginLeft: '4px' }}>(truncated)</span>}
        </div>
        {subtitle && (
          <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
    <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', flexShrink: 0, marginLeft: '8px' }}>
      {tokens.toLocaleString()} tokens
    </span>
  </div>
);
