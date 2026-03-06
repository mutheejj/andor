import React from 'react';
import type { PostMessageFn } from '../App';

export interface CommandApprovalRequest {
  commandId: string;
  command: string;
  description: string;
}

interface CommandApprovalProps {
  request: CommandApprovalRequest;
  postMessage: PostMessageFn;
  onDismiss: () => void;
}

export function CommandApproval({ request, postMessage, onDismiss }: CommandApprovalProps) {
  const handleAllow = () => {
    postMessage({ type: 'approveCommand', commandId: request.commandId });
    onDismiss();
  };

  const handleAlwaysAllow = () => {
    postMessage({ type: 'alwaysAllowCommand', commandId: request.commandId });
    onDismiss();
  };

  const handleDeny = () => {
    postMessage({ type: 'denyCommand', commandId: request.commandId });
    onDismiss();
  };

  return (
    <div
      className="rounded overflow-hidden animate-fade-in my-2"
      style={{ border: '1px solid var(--vscode-editorWarning-foreground, #cca700)' }}
    >
      <div
        className="px-3 py-2 text-xs font-semibold flex items-center gap-1.5"
        style={{
          backgroundColor: 'rgba(204, 167, 0, 0.1)',
          color: 'var(--vscode-editorWarning-foreground, #cca700)',
        }}
      >
        <span>⚠️</span>
        <span>Command Approval Required</span>
      </div>
      <div className="px-3 py-2" style={{ background: 'var(--vscode-input-background)' }}>
        <div className="text-[10px] opacity-60 mb-1.5">Andor wants to run:</div>
        <div
          className="px-2.5 py-1.5 rounded text-xs mb-1.5"
          style={{
            background: 'var(--vscode-editor-background)',
            fontFamily: 'var(--vscode-editor-font-family)',
            border: '1px solid var(--vscode-panel-border)',
          }}
        >
          <span className="opacity-50">$ </span>{request.command}
        </div>
        <div className="text-[10px] opacity-50 mb-2.5">{request.description}</div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleAllow}
            className="text-[10px] px-2.5 py-1 rounded font-medium"
            style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
          >
            ✓ Allow Once
          </button>
          <button
            onClick={handleAlwaysAllow}
            className="text-[10px] px-2.5 py-1 rounded font-medium"
            style={{
              background: 'rgba(76, 175, 80, 0.2)',
              color: 'var(--vscode-testing-iconPassed, #4caf50)',
            }}
          >
            ⚡ Always Allow
          </button>
          <button
            onClick={handleDeny}
            className="text-[10px] px-2.5 py-1 rounded opacity-70 hover:opacity-100"
            style={{ background: 'var(--vscode-input-background)' }}
          >
            ✗ Deny
          </button>
        </div>
      </div>
    </div>
  );
}
