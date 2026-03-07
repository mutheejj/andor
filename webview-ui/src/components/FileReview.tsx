import React, { useState } from 'react';

export interface ReviewedFile {
  path: string;
  relativePath: string;
  language: string;
  action: 'read' | 'edit' | 'create' | 'delete';
}

interface FileReviewProps {
  files: ReviewedFile[];
  title?: string;
}

const LANG_ICONS: Record<string, { icon: string; color: string }> = {
  typescript: { icon: 'TS', color: '#3178c6' },
  typescriptreact: { icon: 'TSX', color: '#3178c6' },
  javascript: { icon: 'JS', color: '#f7df1e' },
  javascriptreact: { icon: 'JSX', color: '#f7df1e' },
  python: { icon: 'PY', color: '#3776ab' },
  go: { icon: 'GO', color: '#00add8' },
  rust: { icon: 'RS', color: '#ce422b' },
  java: { icon: 'JV', color: '#ed8b00' },
  html: { icon: '🌐', color: '#e34c26' },
  css: { icon: '🎨', color: '#563d7c' },
  scss: { icon: '🎨', color: '#c6538c' },
  json: { icon: '{}', color: '#6d6d6d' },
  yaml: { icon: 'YML', color: '#cb171e' },
  markdown: { icon: 'MD', color: '#083fa1' },
  vue: { icon: 'VUE', color: '#42b883' },
  svelte: { icon: 'SV', color: '#ff3e00' },
  plaintext: { icon: 'TXT', color: '#6d6d6d' },
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  read: { label: 'Read', color: 'var(--vscode-foreground)' },
  edit: { label: 'Edited', color: '#4ec9b0' },
  create: { label: 'Created', color: '#6a9955' },
  delete: { label: 'Deleted', color: '#f48771' },
};

function getLangInfo(language: string) {
  return LANG_ICONS[language] || LANG_ICONS.plaintext;
}

export function FileReview({ files, title }: FileReviewProps) {
  const [expanded, setExpanded] = useState(false);

  if (files.length === 0) return null;

  return (
    <div className="my-1.5 rounded-md overflow-hidden animate-fade-in" style={{ border: '1px solid var(--vscode-panel-border)' }}>
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:opacity-90 transition-opacity"
        style={{ background: 'var(--vscode-editor-background)' }}
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-[10px] opacity-60">✓</span>
        <span className="text-[11px] opacity-80">
          {title || `Reviewed ${files.length} file${files.length !== 1 ? 's' : ''}`}
        </span>
        <span className="text-[9px] opacity-30 ml-auto" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          ▼
        </span>
      </div>

      {expanded && (
        <div className="px-2 py-1.5 space-y-0.5" style={{ background: 'var(--vscode-editor-background)' }}>
          {files.map((file, i) => {
            const lang = getLangInfo(file.language);
            const action = ACTION_LABELS[file.action] || ACTION_LABELS.read;
            return (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1 rounded text-[11px] hover:opacity-90"
                style={{ background: 'var(--vscode-list-hoverBackground, rgba(255,255,255,0.04))' }}
              >
                <span
                  className="text-[8px] font-mono font-bold px-1 py-0.5 rounded flex-shrink-0"
                  style={{ background: lang.color + '22', color: lang.color, minWidth: '24px', textAlign: 'center' }}
                >
                  {lang.icon}
                </span>
                <span className="truncate flex-1 opacity-80">{file.relativePath}</span>
                <span className="text-[9px] flex-shrink-0 px-1.5 py-0.5 rounded" style={{ color: action.color, opacity: 0.7 }}>
                  {action.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
