import React, { useState } from 'react';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface WebSearchResultsProps {
  results: SearchResult[];
  query: string;
  onFetchUrl?: (url: string) => void;
}

export function WebSearchResults({ results, query, onFetchUrl }: WebSearchResultsProps) {
  const [expanded, setExpanded] = useState(true);

  if (results.length === 0) return null;

  return (
    <div
      className="rounded-md overflow-hidden my-1.5 text-[11px]"
      style={{
        border: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-editorWidget-background, #1e1e1e)',
      }}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:opacity-80"
        style={{ background: 'var(--vscode-sideBarSectionHeader-background)' }}
      >
        <span>🔍</span>
        <span className="font-medium">Web Search: {query}</span>
        <span className="opacity-40 ml-auto">{results.length} results</span>
        <span className="opacity-40">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="divide-y" style={{ borderColor: 'var(--vscode-panel-border)' }}>
          {results.map((r, i) => (
            <div key={i} className="px-2.5 py-1.5">
              <a
                href={r.url}
                className="font-medium hover:underline block truncate"
                style={{ color: 'var(--vscode-textLink-foreground)' }}
                title={r.url}
                onClick={(e) => {
                  e.preventDefault();
                  // Open in browser via extension
                  if (typeof window !== 'undefined' && (window as any).vscodeApi) {
                    (window as any).vscodeApi.postMessage({ type: 'openExternal', url: r.url });
                  }
                }}
              >
                {r.title || r.url}
              </a>
              {r.snippet && (
                <p className="opacity-60 mt-0.5 line-clamp-2">{r.snippet}</p>
              )}
              {onFetchUrl && (
                <button
                  onClick={() => onFetchUrl(r.url)}
                  className="text-[9px] mt-0.5 opacity-40 hover:opacity-80 underline"
                >
                  Read page content
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
