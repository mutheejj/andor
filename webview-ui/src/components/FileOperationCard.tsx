import React, { useState } from 'react';
import type { PostMessageFn } from '../App';

interface FileOpModified {
  type: 'modified';
  filePath: string;
  diff?: Array<{ type: 'add' | 'remove' | 'context'; content: string }>;
  code: string;
  language: string;
}

interface FileOpCreated {
  type: 'created';
  filePath: string;
  language: string;
  lineCount: number;
  size: string;
}

interface FileOpDeleted {
  type: 'deleted';
  filePath: string;
  previousLines: number;
}

export type FileOperation = FileOpModified | FileOpCreated | FileOpDeleted;

interface FileOperationCardProps {
  operation: FileOperation;
  postMessage: PostMessageFn;
  onAccept?: () => void;
  onReject?: () => void;
}

export function FileOperationCard({ operation, postMessage, onAccept, onReject }: FileOperationCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (operation.type === 'modified') {
    return (
      <div
        className="rounded overflow-hidden my-2 animate-fade-in"
        style={{ border: '1px solid var(--vscode-panel-border)' }}
      >
        <div
          className="flex items-center justify-between px-3 py-1.5 text-xs"
          style={{ backgroundColor: 'var(--vscode-editor-background)' }}
        >
          <div className="flex items-center gap-1.5">
            <span>📝</span>
            <span className="opacity-80 truncate" style={{ fontFamily: 'var(--vscode-editor-font-family)' }}>
              {operation.filePath}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255, 193, 7, 0.15)', color: '#ffc107' }}>
              Modified
            </span>
          </div>
        </div>

        {/* Diff lines */}
        {operation.diff && operation.diff.length > 0 && (
          <div
            className="overflow-x-auto text-[11px] leading-relaxed"
            style={{
              backgroundColor: 'var(--vscode-editor-background)',
              fontFamily: 'var(--vscode-editor-font-family)',
              maxHeight: expanded ? 'none' : '120px',
              borderTop: '1px solid var(--vscode-panel-border)',
            }}
          >
            {operation.diff.slice(0, expanded ? undefined : 8).map((line, i) => (
              <div
                key={i}
                className="px-3 py-0"
                style={{
                  backgroundColor:
                    line.type === 'add' ? 'rgba(40, 160, 40, 0.12)' :
                    line.type === 'remove' ? 'rgba(220, 50, 50, 0.12)' :
                    'transparent',
                }}
              >
                <span style={{
                  color: line.type === 'add' ? '#4ec94e' : line.type === 'remove' ? '#f44' : 'inherit',
                  opacity: line.type === 'context' ? 0.6 : 1,
                }}>
                  {line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  '}
                  {line.content}
                </span>
              </div>
            ))}
            {!expanded && operation.diff.length > 8 && (
              <button
                onClick={() => setExpanded(true)}
                className="w-full text-center text-[10px] py-1 opacity-50 hover:opacity-80"
              >
                Show {operation.diff.length - 8} more lines...
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div
          className="flex items-center gap-1.5 px-3 py-1.5"
          style={{ borderTop: '1px solid var(--vscode-panel-border)', backgroundColor: 'var(--vscode-editor-background)' }}
        >
          <button
            onClick={() => postMessage({ type: 'requestDiff', code: operation.code, filePath: operation.filePath, language: operation.language })}
            className="text-[10px] px-2 py-0.5 rounded opacity-70 hover:opacity-100"
            style={{ background: 'var(--vscode-input-background)' }}
          >
            View Full Diff ↗
          </button>
          {onAccept && (
            <button
              onClick={onAccept}
              className="text-[10px] px-2 py-0.5 rounded font-medium"
              style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
            >
              ✓ Accept
            </button>
          )}
          {onReject && (
            <button
              onClick={onReject}
              className="text-[10px] px-2 py-0.5 rounded opacity-70 hover:opacity-100"
              style={{ background: 'var(--vscode-input-background)' }}
            >
              ✗ Reject
            </button>
          )}
        </div>
      </div>
    );
  }

  if (operation.type === 'created') {
    return (
      <div
        className="rounded overflow-hidden my-2 animate-fade-in"
        style={{ border: '1px solid var(--vscode-panel-border)' }}
      >
        <div
          className="flex items-center justify-between px-3 py-2 text-xs"
          style={{ backgroundColor: 'var(--vscode-editor-background)' }}
        >
          <div className="flex items-center gap-1.5">
            <span>✨</span>
            <span className="opacity-80 truncate" style={{ fontFamily: 'var(--vscode-editor-font-family)' }}>
              {operation.filePath}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(76, 175, 80, 0.15)', color: '#4caf50' }}>
              Created
            </span>
          </div>
          <button
            onClick={() => postMessage({ type: 'openExternal', url: `vscode://file/${operation.filePath}` })}
            className="text-[10px] px-2 py-0.5 rounded opacity-70 hover:opacity-100"
            style={{ background: 'var(--vscode-input-background)' }}
          >
            Open File ↗
          </button>
        </div>
        <div className="px-3 py-1 text-[10px] opacity-50" style={{ backgroundColor: 'var(--vscode-editor-background)' }}>
          {operation.language} · {operation.lineCount} lines · {operation.size}
        </div>
      </div>
    );
  }

  if (operation.type === 'deleted') {
    return (
      <div
        className="rounded overflow-hidden my-2 animate-fade-in"
        style={{ border: '1px solid var(--vscode-panel-border)' }}
      >
        <div
          className="flex items-center justify-between px-3 py-2 text-xs"
          style={{ backgroundColor: 'var(--vscode-editor-background)' }}
        >
          <div className="flex items-center gap-1.5">
            <span>🗑️</span>
            <span className="opacity-80 truncate" style={{ fontFamily: 'var(--vscode-editor-font-family)' }}>
              {operation.filePath}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(244, 67, 54, 0.15)', color: '#f44336' }}>
              Deleted
            </span>
          </div>
        </div>
        <div className="px-3 py-1 text-[10px] opacity-50" style={{ backgroundColor: 'var(--vscode-editor-background)' }}>
          Previously {operation.previousLines} lines
        </div>
      </div>
    );
  }

  return null;
}
