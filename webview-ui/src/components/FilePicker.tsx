import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface FileEntry {
  path: string;
  relativePath: string;
  name: string;
  isDirectory: boolean;
  language: string;
}

interface FilePickerProps {
  query: string;
  files: FileEntry[];
  visible: boolean;
  onSelect: (file: FileEntry) => void;
  onDismiss: () => void;
  mode: 'slash' | 'button'; // slash = triggered by /, button = triggered by Add button
}

const LANG_ICONS: Record<string, { label: string; color: string }> = {
  typescript: { label: 'TS', color: '#3178c6' },
  typescriptreact: { label: 'TSX', color: '#3178c6' },
  javascript: { label: 'JS', color: '#f7df1e' },
  javascriptreact: { label: 'JSX', color: '#f7df1e' },
  python: { label: 'PY', color: '#3776ab' },
  go: { label: 'GO', color: '#00add8' },
  rust: { label: 'RS', color: '#ce422b' },
  java: { label: 'JV', color: '#ed8b00' },
  html: { label: 'HTML', color: '#e34c26' },
  css: { label: 'CSS', color: '#563d7c' },
  scss: { label: 'SCSS', color: '#c6538c' },
  json: { label: '{ }', color: '#6d6d6d' },
  yaml: { label: 'YML', color: '#cb171e' },
  markdown: { label: 'MD', color: '#083fa1' },
  vue: { label: 'VUE', color: '#42b883' },
  svelte: { label: 'SV', color: '#ff3e00' },
  php: { label: 'PHP', color: '#777bb4' },
  ruby: { label: 'RB', color: '#cc342d' },
  shell: { label: 'SH', color: '#89e051' },
  directory: { label: '📁', color: '#dcb67a' },
};

function getLangInfo(language: string, isDir: boolean) {
  if (isDir) return LANG_ICONS.directory;
  return LANG_ICONS[language] || { label: language.slice(0, 3).toUpperCase(), color: '#6d6d6d' };
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  // simple fuzzy: all query chars appear in order
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function FilePicker({ query, files, visible, onSelect, onDismiss, mode }: FilePickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = files.filter(f => {
    if (!query) return true;
    return fuzzyMatch(query, f.relativePath) || fuzzyMatch(query, f.name);
  }).slice(0, 30);

  // Sort: directories first, then by name
  const sorted = [...filtered].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.relativePath.localeCompare(b.relativePath);
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, files]);

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(i => Math.min(i + 1, sorted.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (sorted[selectedIndex]) {
          onSelect(sorted[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, sorted, selectedIndex, onSelect, onDismiss]);

  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('[data-file-item]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!visible) return null;

  return (
    <div
      className="absolute z-50 rounded-md shadow-lg overflow-hidden animate-fade-in"
      style={{
        bottom: mode === 'slash' ? '100%' : undefined,
        top: mode === 'button' ? '100%' : undefined,
        left: 0,
        right: 0,
        maxHeight: '280px',
        background: 'var(--vscode-editorWidget-background, #252526)',
        border: '1px solid var(--vscode-editorWidget-border, #454545)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <span className="text-[10px] opacity-60">
          {query ? `Files matching "${query}"` : 'All project files'} — {sorted.length} results
        </span>
        <button
          onClick={onDismiss}
          className="text-[9px] px-1.5 py-0.5 rounded opacity-50 hover:opacity-100"
          style={{ background: 'var(--vscode-input-background)' }}
        >
          Esc
        </button>
      </div>

      {/* File list */}
      <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: '240px' }}>
        {sorted.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] opacity-40">
            No files found{query ? ` matching "${query}"` : ''}
          </div>
        ) : (
          sorted.map((file, index) => {
            const lang = getLangInfo(file.language, file.isDirectory);
            return (
              <div
                key={file.path}
                data-file-item
                className="flex items-center gap-2 px-2.5 py-1 cursor-pointer text-[11px] transition-colors"
                style={{
                  background: index === selectedIndex
                    ? 'var(--vscode-list-activeSelectionBackground, #094771)'
                    : 'transparent',
                  color: index === selectedIndex
                    ? 'var(--vscode-list-activeSelectionForeground, #fff)'
                    : 'var(--vscode-foreground)',
                }}
                onClick={() => onSelect(file)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span
                  className="text-[8px] font-mono font-bold px-1 py-0.5 rounded flex-shrink-0"
                  style={{
                    background: lang.color + '22',
                    color: lang.color,
                    minWidth: '26px',
                    textAlign: 'center',
                  }}
                >
                  {lang.label}
                </span>
                <span className="font-medium truncate">{file.name}</span>
                <span className="opacity-30 truncate text-[9px] ml-auto flex-shrink-0">
                  {file.relativePath.includes('/') ? file.relativePath.replace(/\/[^/]+$/, '/') : ''}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="px-2.5 py-1 text-[9px] opacity-30" style={{ borderTop: '1px solid var(--vscode-panel-border)' }}>
        ↑↓ Navigate · Enter to add · Esc to close
      </div>
    </div>
  );
}
