import React, { useState } from 'react';

interface ThinkingBlockProps {
  content: string;
  isActive: boolean;
}

export function ThinkingBlock({ content, isActive }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="my-1.5 rounded-md overflow-hidden animate-fade-in"
      style={{
        border: '1px solid var(--vscode-inputValidation-infoBorder, #007acc)',
        background: 'var(--vscode-inputValidation-infoBackground, #063b49)',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        {isActive ? (
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" style={{ color: '#4ec9b0' }} />
        ) : (
          <span className="text-[10px]" style={{ color: '#4ec9b0' }}>🧠</span>
        )}
        <span className="text-[11px] font-medium" style={{ color: '#4ec9b0' }}>
          {isActive ? 'Thinking...' : 'Thought process'}
        </span>
        <span className="text-[9px] opacity-30 ml-auto" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          ▼
        </span>
      </div>

      {expanded && content && (
        <div className="px-3 pb-2">
          <div className="text-[11px] opacity-70 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--vscode-foreground)' }}>
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
