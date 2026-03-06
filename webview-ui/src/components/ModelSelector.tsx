import React, { useState, useEffect, useRef } from 'react';

export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  contextWindow: number;
  free: boolean;
  bestFor: string;
  tier: 'fast' | 'balanced' | 'powerful';
}

interface ModelSelectorProps {
  selected: string;
  onChange: (model: string) => void;
  models?: ModelInfo[];
}

const tierIcon: Record<string, string> = {
  powerful: '🔥',
  balanced: '⚡',
  fast: '🚀',
};

function formatContext(ctx: number): string {
  if (ctx >= 1000000) { return `${(ctx / 1000000).toFixed(0)}M`; }
  if (ctx >= 1000) { return `${(ctx / 1000).toFixed(0)}K`; }
  return String(ctx);
}

export function ModelSelector({ selected, onChange, models }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allModels = models || [];

  // Group models by provider
  const grouped = new Map<string, ModelInfo[]>();
  for (const m of allModels) {
    const existing = grouped.get(m.providerName) || [];
    existing.push(m);
    grouped.set(m.providerName, existing);
  }

  const filteredGrouped = new Map<string, ModelInfo[]>();
  const lowerSearch = search.toLowerCase();
  for (const [provider, provModels] of grouped) {
    const filtered = lowerSearch
      ? provModels.filter(m =>
          m.name.toLowerCase().includes(lowerSearch) ||
          m.bestFor.toLowerCase().includes(lowerSearch) ||
          m.tier.includes(lowerSearch) ||
          provider.toLowerCase().includes(lowerSearch))
      : provModels;
    if (filtered.length > 0) {
      // Sort by tier: powerful first, then balanced, then fast
      const tierOrder = { powerful: 0, balanced: 1, fast: 2 };
      filtered.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);
      filteredGrouped.set(provider, filtered);
    }
  }

  const selectedModel = allModels.find(m => m.id === selected);
  const displayName = selectedModel
    ? `${selectedModel.name}`
    : selected || 'Select model';
  const displayProvider = selectedModel?.providerName || '';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left text-xs py-1.5 px-2 rounded cursor-pointer outline-none flex items-center justify-between gap-1"
        style={{
          backgroundColor: 'var(--vscode-input-background)',
          color: 'var(--vscode-input-foreground)',
          border: '1px solid var(--vscode-input-border, transparent)',
        }}
      >
        <span className="truncate">
          {displayName}
          {displayProvider && (
            <span className="opacity-40 ml-1">· {displayProvider}</span>
          )}
        </span>
        <span className="opacity-50 flex-shrink-0">{isOpen ? '▴' : '▾'}</span>
      </button>

      {isOpen && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 rounded overflow-hidden shadow-lg"
          style={{
            backgroundColor: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
            border: '1px solid var(--vscode-panel-border)',
            maxHeight: '350px',
          }}
        >
          {/* Search */}
          <div className="px-2 py-1.5" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              autoFocus
              className="w-full text-xs py-1 px-2 rounded outline-none"
              style={{
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border, transparent)',
              }}
            />
          </div>

          {/* Model list */}
          <div className="overflow-y-auto" style={{ maxHeight: '300px' }}>
            {Array.from(filteredGrouped.entries()).map(([providerName, provModels]) => (
              <div key={providerName}>
                <div
                  className="text-[10px] font-semibold px-2.5 py-1.5 uppercase tracking-wider opacity-50 sticky top-0"
                  style={{ backgroundColor: 'var(--vscode-dropdown-background, var(--vscode-input-background))' }}
                >
                  {providerName}
                </div>
                {provModels.map((m) => (
                  <button
                    key={`${m.providerId}::${m.id}`}
                    onClick={() => {
                      onChange(m.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-xs hover:opacity-90 flex items-center gap-1.5 transition-colors"
                    style={{
                      backgroundColor: m.id === selected
                        ? 'var(--vscode-list-activeSelectionBackground, rgba(255,255,255,0.1))'
                        : 'transparent',
                      color: m.id === selected
                        ? 'var(--vscode-list-activeSelectionForeground, inherit)'
                        : 'inherit',
                    }}
                  >
                    <span className="flex-shrink-0 w-4 text-center text-[10px]">{tierIcon[m.tier] || ''}</span>
                    <span className="flex-1 truncate">{m.name}</span>
                    <span className="flex-shrink-0 flex items-center gap-1">
                      {m.free && (
                        <span className="text-[9px] px-1 py-0 rounded" style={{ background: 'rgba(76, 175, 80, 0.2)', color: '#4caf50' }}>FREE</span>
                      )}
                      {m.contextWindow >= 100000 && (
                        <span className="text-[9px] px-1 py-0 rounded opacity-50" style={{ background: 'var(--vscode-badge-background)' }}>
                          {formatContext(m.contextWindow)}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {filteredGrouped.size === 0 && (
              <div className="text-xs opacity-40 text-center py-4">No models found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
