import React, { useState } from 'react';

interface TerminalCommandBlockProps {
  command: string;
  output?: string;
  exitCode?: number | null;
  status: 'pending' | 'running' | 'done' | 'rejected';
  onApprove?: () => void;
  onReject?: () => void;
}

export function TerminalCommandBlock({ command, output, exitCode, status, onApprove, onReject }: TerminalCommandBlockProps) {
  const [showOutput, setShowOutput] = useState(true); // Auto-expand output by default

  const statusColors = {
    pending: { bg: 'var(--vscode-inputValidation-warningBackground, #352a05)', border: 'var(--vscode-inputValidation-warningBorder, #9d8200)', text: '#cca700' },
    running: { bg: 'var(--vscode-inputValidation-infoBackground, #063b49)', border: 'var(--vscode-inputValidation-infoBorder, #007acc)', text: '#4ec9b0' },
    done: { bg: exitCode === 0 ? 'rgba(78, 201, 176, 0.08)' : 'rgba(244, 135, 113, 0.08)', border: exitCode === 0 ? '#4ec9b044' : '#f4877144', text: exitCode === 0 ? '#4ec9b0' : '#f48771' },
    rejected: { bg: 'rgba(244, 135, 113, 0.08)', border: '#f4877144', text: '#f48771' },
  };

  const colors = statusColors[status];

  return (
    <div
      className="my-1.5 rounded-md overflow-hidden animate-fade-in"
      style={{ border: `1px solid ${colors.border}`, background: colors.bg }}
    >
      {/* Command header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[10px] flex-shrink-0" style={{ color: colors.text }}>
          {status === 'running' ? '⟳' : status === 'done' ? (exitCode === 0 ? '✓' : '✗') : status === 'rejected' ? '✗' : '▸'}
        </span>
        <span className="text-[10px] opacity-50 flex-shrink-0">Terminal</span>
        <code
          className="text-[11px] font-mono flex-1 truncate"
          style={{ color: 'var(--vscode-foreground)' }}
        >
          {command}
        </code>

        {/* Status / Actions */}
        {status === 'pending' && onApprove && onReject && (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={onReject}
              className="text-[10px] px-2 py-0.5 rounded font-medium transition-opacity hover:opacity-100"
              style={{ background: 'var(--vscode-input-background)', color: '#f48771', opacity: 0.8 }}
            >
              Reject
            </button>
            <button
              onClick={onApprove}
              className="text-[10px] px-2 py-0.5 rounded font-medium transition-opacity hover:opacity-100"
              style={{ background: '#4ec9b0', color: '#000', opacity: 0.9 }}
            >
              Accept
            </button>
          </div>
        )}
        {status === 'running' && (
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" style={{ color: colors.text }} />
        )}
        {status === 'done' && exitCode !== null && exitCode !== undefined && (
          <span className="text-[9px] flex-shrink-0 opacity-50">
            exit {exitCode}
          </span>
        )}
        {status === 'rejected' && (
          <span className="text-[9px] flex-shrink-0" style={{ color: '#f48771' }}>
            Rejected
          </span>
        )}
      </div>

      {/* Output */}
      {output && (
        <>
          <div
            className="px-3 py-1 cursor-pointer text-[9px] opacity-40 hover:opacity-70 transition-opacity"
            style={{ borderTop: `1px solid ${colors.border}` }}
            onClick={() => setShowOutput(v => !v)}
          >
            {showOutput ? '▾ Hide output' : '▸ Show output'}
          </div>
          {showOutput && (
            <div
              className="px-3 py-2 overflow-x-auto max-h-[200px] overflow-y-auto"
              style={{ borderTop: `1px solid ${colors.border}` }}
            >
              <pre className="text-[10px] font-mono whitespace-pre-wrap opacity-70" style={{ color: 'var(--vscode-foreground)' }}>
                {output}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
