import React from 'react';

export type ChatMode = 'chat' | 'agent';

interface ModeSelectorProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  thinking: boolean;
  onThinkingChange: (thinking: boolean) => void;
}

export function ModeSelector({ mode, onChange, thinking, onThinkingChange }: ModeSelectorProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
      {/* Mode toggle */}
      <div
        className="flex rounded-md overflow-hidden text-[10px] font-medium"
        style={{ border: '1px solid var(--vscode-panel-border)' }}
      >
        <button
          onClick={() => onChange('chat')}
          className="px-2.5 py-1 transition-colors"
          style={{
            background: mode === 'chat' ? 'var(--vscode-button-background)' : 'transparent',
            color: mode === 'chat' ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
            opacity: mode === 'chat' ? 1 : 0.6,
          }}
          title="Chat mode — conversation only, no file edits"
        >
          💬 Chat
        </button>
        <button
          onClick={() => onChange('agent')}
          className="px-2.5 py-1 transition-colors"
          style={{
            background: mode === 'agent' ? 'var(--vscode-button-background)' : 'transparent',
            color: mode === 'agent' ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
            opacity: mode === 'agent' ? 1 : 0.6,
            borderLeft: '1px solid var(--vscode-panel-border)',
          }}
          title="Agent mode — can edit files, run commands, make changes"
        >
          🤖 Agent
        </button>
      </div>

      {/* Thinking toggle */}
      <button
        onClick={() => onThinkingChange(!thinking)}
        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-all"
        style={{
          background: thinking ? 'var(--vscode-inputValidation-infoBackground, #063b49)' : 'transparent',
          color: thinking ? 'var(--vscode-inputValidation-infoForeground, #4ec9b0)' : 'var(--vscode-foreground)',
          opacity: thinking ? 1 : 0.5,
          border: thinking ? '1px solid var(--vscode-inputValidation-infoBorder, #007acc)' : '1px solid transparent',
        }}
        title="Thinking mode — AI plans and verifies before making changes"
      >
        🧠 {thinking ? 'Thinking ON' : 'Think'}
      </button>

      {/* Mode description */}
      <span className="text-[9px] opacity-30 ml-auto">
        {mode === 'chat' ? 'No file edits' : 'Can edit files & run commands'}
      </span>
    </div>
  );
}
