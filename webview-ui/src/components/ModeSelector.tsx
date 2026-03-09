import React from 'react';

export type ChatMode = 'chat' | 'agent';

export type AgentModeId = 'architect' | 'code' | 'ask' | 'debug' | 'orchestrator' | 'review';

export interface AgentModeOption {
  id: AgentModeId;
  label: string;
  description: string;
  behavior: ChatMode;
}

export const AGENT_MODE_OPTIONS: AgentModeOption[] = [
  {
    id: 'architect',
    label: 'Architect',
    description: 'Plan and design before implementation',
    behavior: 'chat',
  },
  {
    id: 'code',
    label: 'Code',
    description: 'Write, modify, and refactor code',
    behavior: 'agent',
  },
  {
    id: 'ask',
    label: 'Ask',
    description: 'Get answers and explanations',
    behavior: 'chat',
  },
  {
    id: 'debug',
    label: 'Debug',
    description: 'Diagnose and fix software issues',
    behavior: 'agent',
  },
  {
    id: 'orchestrator',
    label: 'Orchestrator',
    description: 'Coordinate tasks across multiple modes',
    behavior: 'agent',
  },
  {
    id: 'review',
    label: 'Review',
    description: 'Review local code changes and decisions',
    behavior: 'chat',
  },
];

interface ModeSelectorProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  thinking: boolean;
  onThinkingChange: (thinking: boolean) => void;
  selectedAgentMode?: AgentModeId;
  onAgentModeChange?: (mode: AgentModeId) => void;
}

export function ModeSelector({ mode, onChange, thinking, onThinkingChange, selectedAgentMode, onAgentModeChange }: ModeSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  const resolvedMode = AGENT_MODE_OPTIONS.find((option) => option.id === selectedAgentMode)
    ?? AGENT_MODE_OPTIONS.find((option) => option.behavior === mode)
    ?? AGENT_MODE_OPTIONS[1];

  const filteredModes = AGENT_MODE_OPTIONS.filter((option) => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return option.label.toLowerCase().includes(query) || option.description.toLowerCase().includes(query);
  });

  const handleSelect = (option: AgentModeOption) => {
    onAgentModeChange?.(option.id);
    onChange(option.behavior);
    setSearch('');
    setIsOpen(false);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
      <div className="relative" ref={containerRef}>
        <button
          onClick={() => setIsOpen((value) => !value)}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors"
          style={{
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-panel-border)',
            minWidth: '140px',
          }}
          title={resolvedMode.description}
        >
          <span>{resolvedMode.label}</span>
          <span className="ml-auto opacity-50">▾</span>
        </button>

        {isOpen && (
          <div
            className="absolute left-0 top-full z-50 mt-1 w-[320px] overflow-hidden rounded-md shadow-lg"
            style={{
              background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
              border: '1px solid var(--vscode-panel-border)',
            }}
          >
            <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search..."
                className="w-full rounded px-2 py-2 text-xs outline-none"
                style={{
                  background: 'var(--vscode-input-background)',
                  color: 'var(--vscode-input-foreground)',
                  border: '1px solid var(--vscode-panel-border)',
                }}
              />
              <div className="mt-2 text-[10px] opacity-50">
                Ctrl + . for next mode. Ctrl + Shift + . for previous mode
              </div>
            </div>
            <div className="max-h-[320px] overflow-y-auto py-1">
              {filteredModes.map((option) => {
                const isSelected = option.id === resolvedMode.id;

                return (
                  <button
                    key={option.id}
                    onClick={() => handleSelect(option)}
                    className="flex w-full items-start gap-3 px-3 py-2 text-left transition-colors"
                    style={{
                      background: isSelected ? 'var(--vscode-list-activeSelectionBackground, #094771)' : 'transparent',
                      color: isSelected ? 'var(--vscode-list-activeSelectionForeground, #ffffff)' : 'var(--vscode-foreground)',
                    }}
                  >
                    <span className="mt-0.5 text-[12px] opacity-70">
                      {option.behavior === 'agent' ? '</>' : '?'}
                    </span>
                    <span className="flex-1">
                      <div className="text-sm font-medium">{option.label}</div>
                      <div className="text-xs opacity-65">{option.description}</div>
                    </span>
                    {isSelected && <span className="text-sm">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

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

      <span className="text-[9px] opacity-30 ml-auto">
        {resolvedMode.description}
      </span>
    </div>
  );
}
