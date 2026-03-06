import React, { useState } from 'react';

interface CodeBlockProps {
  code: string;
  language: string;
  filePath?: string;
  onApply?: (code: string, filePath: string, language: string) => void;
  onRequestDiff?: (code: string, filePath: string, language: string) => void;
}

export function CodeBlock({ code, language, filePath, onApply, onRequestDiff }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for webview
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApply = () => {
    if (onApply && filePath) {
      onApply(code, filePath, language);
    }
  };

  const handleDiff = () => {
    if (onRequestDiff && filePath) {
      onRequestDiff(code, filePath, language);
    }
  };

  return (
    <div className="my-2 rounded overflow-hidden" style={{ border: '1px solid var(--vscode-panel-border)' }}>
      <div
        className="flex items-center justify-between px-3 py-1.5 text-[11px]"
        style={{ backgroundColor: 'var(--vscode-editor-background)' }}
      >
        <div className="flex items-center gap-2">
          <span className="opacity-70">{language}</span>
          {filePath && (
            <span className="opacity-50 truncate max-w-[180px]" title={filePath}>
              {filePath}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="px-2 py-0.5 rounded text-[10px] transition-opacity hover:opacity-100 opacity-70"
            style={{ background: 'var(--vscode-input-background)' }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          {filePath && onRequestDiff && (
            <button
              onClick={handleDiff}
              className="px-2 py-0.5 rounded text-[10px] transition-opacity hover:opacity-100 opacity-70"
              style={{ background: 'var(--vscode-input-background)' }}
            >
              Diff
            </button>
          )}
          {filePath && onApply && (
            <button
              onClick={handleApply}
              className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
              style={{
                backgroundColor: 'var(--vscode-button-background)',
                color: 'var(--vscode-button-foreground)',
              }}
            >
              Apply
            </button>
          )}
        </div>
      </div>
      <pre
        className="p-3 overflow-x-auto text-xs leading-relaxed"
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          fontFamily: 'var(--vscode-editor-font-family)',
          fontSize: 'var(--vscode-editor-font-size, 12px)',
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
