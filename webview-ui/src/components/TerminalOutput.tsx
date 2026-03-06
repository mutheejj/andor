import React, { useState } from 'react';

interface TerminalOutputProps {
  command: string;
  output: string;
  exitCode: number;
}

export function TerminalOutput({ command, output, exitCode }: TerminalOutputProps) {
  const [expanded, setExpanded] = useState(false);
  const isSuccess = exitCode === 0;
  const lines = output.split('\n');
  const isLong = lines.length > 20;

  return (
    <div
      className="rounded overflow-hidden my-2 animate-fade-in"
      style={{
        border: `1px solid ${isSuccess ? 'var(--vscode-testing-iconPassed, #4caf50)' : 'var(--vscode-errorForeground, #f44336)'}`,
      }}
    >
      {/* Command header */}
      <div
        className="px-3 py-1.5 text-xs flex items-center gap-1.5"
        style={{
          backgroundColor: isSuccess ? 'rgba(76, 175, 80, 0.08)' : 'rgba(244, 67, 54, 0.08)',
          fontFamily: 'var(--vscode-editor-font-family)',
        }}
      >
        <span className="opacity-50">$</span>
        <span>{command}</span>
      </div>

      {/* Output */}
      <div
        className="px-3 py-1.5 text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap"
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          fontFamily: 'var(--vscode-editor-font-family)',
          maxHeight: isLong && !expanded ? '200px' : 'none',
          overflow: isLong && !expanded ? 'hidden' : 'auto',
        }}
      >
        {isLong && !expanded ? lines.slice(0, 20).join('\n') : output}
      </div>

      {/* Expand / Status */}
      <div
        className="flex items-center justify-between px-3 py-1"
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          borderTop: '1px solid var(--vscode-panel-border)',
        }}
      >
        <span className="text-[10px]" style={{
          color: isSuccess ? 'var(--vscode-testing-iconPassed, #4caf50)' : 'var(--vscode-errorForeground, #f44336)',
        }}>
          {isSuccess ? '✓ Done' : `✗ Exit code ${exitCode}`}
        </span>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] opacity-50 hover:opacity-80"
          >
            {expanded ? 'Collapse' : `Show all ${lines.length} lines`}
          </button>
        )}
      </div>
    </div>
  );
}
