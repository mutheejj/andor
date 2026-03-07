import React, { useState, useEffect } from 'react';

export interface IndexingStatus {
  state: 'idle' | 'indexing' | 'ready' | 'error';
  progress: number;
  totalFiles: number;
  indexedFiles: number;
  currentFile?: string;
  message: string;
}

interface IndexingStatusBarProps {
  status: IndexingStatus;
  onRefresh?: () => void;
}

export function IndexingStatusBar({ status, onRefresh }: IndexingStatusBarProps) {
  const [expanded, setExpanded] = useState(false);

  const stateIcon = {
    idle: '○',
    indexing: '◌',
    ready: '●',
    error: '✕',
  }[status.state];

  const stateColor = {
    idle: 'var(--vscode-foreground)',
    indexing: 'var(--vscode-progressBar-background, #0078d4)',
    ready: '#4ec9b0',
    error: 'var(--vscode-errorForeground, #f48771)',
  }[status.state];

  return (
    <div
      className="flex-shrink-0 select-none"
      style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Status indicator dot */}
        <span
          className={status.state === 'indexing' ? 'animate-spin' : ''}
          style={{ color: stateColor, fontSize: '10px', lineHeight: 1 }}
        >
          {stateIcon}
        </span>

        {/* Progress bar for indexing */}
        {status.state === 'indexing' && (
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--vscode-input-background)', maxWidth: '80px' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${status.progress}%`,
                background: 'var(--vscode-progressBar-background, #0078d4)',
              }}
            />
          </div>
        )}

        {/* Status text */}
        <span className="text-[10px] opacity-70 truncate flex-1">
          {status.state === 'ready'
            ? `${status.indexedFiles} files indexed`
            : status.state === 'indexing'
              ? `Indexing... ${status.progress}%`
              : status.state === 'error'
                ? 'Indexing error'
                : 'Not indexed'}
        </span>

        {/* Refresh button */}
        {status.state === 'ready' && onRefresh && (
          <button
            onClick={(e) => { e.stopPropagation(); onRefresh(); }}
            className="text-[10px] opacity-50 hover:opacity-100 transition-opacity px-1"
            title="Re-index workspace"
          >
            ↻
          </button>
        )}

        {/* Expand arrow */}
        <span className="text-[9px] opacity-40" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          ▼
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-2 animate-fade-in">
          <div className="text-[10px] opacity-60 space-y-0.5">
            <div><span className="opacity-50">State:</span> {status.state}</div>
            <div><span className="opacity-50">Files:</span> {status.indexedFiles} / {status.totalFiles}</div>
            {status.currentFile && (
              <div className="truncate"><span className="opacity-50">Current:</span> {status.currentFile}</div>
            )}
            <div className="truncate"><span className="opacity-50">Info:</span> {status.message}</div>
          </div>
        </div>
      )}
    </div>
  );
}
