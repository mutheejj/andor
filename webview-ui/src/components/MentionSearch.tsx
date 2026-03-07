import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface FileSearchResult {
  path: string;
  relativePath: string;
  name: string;
  language: string;
}

interface MentionSearchProps {
  query: string;
  results: FileSearchResult[];
  visible: boolean;
  onSelect: (result: FileSearchResult) => void;
  onDismiss: () => void;
  position: { top: number; left: number };
}

export function MentionSearch({ query, results, visible, onSelect, onDismiss, position }: MentionSearchProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (results[selectedIndex]) {
          onSelect(results[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, results, selectedIndex, onSelect, onDismiss]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('[data-mention-item]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!visible || results.length === 0) return null;

  const langIcon: Record<string, string> = {
    typescript: 'TS',
    typescriptreact: 'TSX',
    javascript: 'JS',
    javascriptreact: 'JSX',
    python: 'PY',
    go: 'GO',
    rust: 'RS',
    json: '{}',
    css: 'CSS',
    html: 'HTML',
    markdown: 'MD',
  };

  return (
    <div
      className="absolute z-50 rounded-md shadow-lg overflow-hidden animate-fade-in"
      style={{
        bottom: position.top,
        left: position.left,
        minWidth: '280px',
        maxWidth: '400px',
        maxHeight: '200px',
        background: 'var(--vscode-editorWidget-background, #252526)',
        border: '1px solid var(--vscode-editorWidget-border, #454545)',
      }}
    >
      <div className="px-2 py-1 text-[9px] opacity-50" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
        Files matching &quot;{query}&quot;
      </div>
      <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: '170px' }}>
        {results.slice(0, 20).map((result, index) => (
          <div
            key={result.path}
            data-mention-item
            className="flex items-center gap-2 px-2 py-1 cursor-pointer text-[11px]"
            style={{
              background: index === selectedIndex
                ? 'var(--vscode-list-activeSelectionBackground, #094771)'
                : 'transparent',
              color: index === selectedIndex
                ? 'var(--vscode-list-activeSelectionForeground, #fff)'
                : 'var(--vscode-foreground)',
            }}
            onClick={() => onSelect(result)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span
              className="text-[8px] font-mono px-1 py-0.5 rounded flex-shrink-0"
              style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)', minWidth: '24px', textAlign: 'center' }}
            >
              {langIcon[result.language] || result.language.slice(0, 3).toUpperCase()}
            </span>
            <span className="font-medium truncate">{result.name}</span>
            <span className="opacity-40 truncate text-[9px] ml-auto">{result.relativePath}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
