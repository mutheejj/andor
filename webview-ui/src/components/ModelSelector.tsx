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
  modelSpec?: string;
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

const MODEL_LABELS: Record<string, { short: string; usage?: string }> = {
  'meta/llama-3.3-70b-instruct': { short: 'Llama 3.3 70B', usage: 'General coding & reasoning' },
  'meta/llama-3.1-8b-instruct': { short: 'Llama 3.1 8B', usage: 'Fast lightweight tasks' },
  'meta/llama-3.2-90b-vision-instruct': { short: 'Llama 3.2 90B Vision', usage: 'Images, screenshots, multimodal' },
  'meta/llama-3.1-405b-instruct': { short: 'Llama 3.1 405B', usage: 'Most complex tasks' },
  'qwen/qwen2.5-coder-32b-instruct': { short: 'Qwen 2.5 Coder 32B', usage: 'Code generation' },
  'qwen/qwen2.5-72b-instruct': { short: 'Qwen 2.5 72B', usage: 'General purpose' },
  'mistralai/mixtral-8x22b-instruct-v0.1': { short: 'Mixtral 8x22B', usage: 'MoE efficiency' },
  'gemini-2.0-flash': { short: 'Gemini 2.0 Flash', usage: 'Images, screenshots, UI designs' },
};

function getModelLabel(model: ModelInfo): string {
  return MODEL_LABELS[model.id]?.short || model.name || model.id;
}

function getModelUsage(model: ModelInfo): string {
  return MODEL_LABELS[model.id]?.usage || model.bestFor;
}

function getModelValue(model: ModelInfo): string {
  return model.modelSpec || `${model.providerId}::${model.id}`;
}

function buildFallbackModel(selected: string): ModelInfo | null {
  if (!selected) {
    return null;
  }
  const [providerId, rawId] = selected.includes('::') ? selected.split('::', 2) : ['unknown', selected];
  const id = rawId || selected;
  return {
    id,
    name: MODEL_LABELS[id]?.short || id,
    providerId,
    providerName: providerId === 'nvidia' ? 'NVIDIA NIM' : providerId === 'openrouter' ? 'OpenRouter' : providerId === 'google' ? 'Google Gemini' : providerId === 'groq' ? 'Groq' : providerId === 'puter' ? 'Puter.js (Default)' : providerId,
    contextWindow: 0,
    free: true,
    bestFor: MODEL_LABELS[id]?.usage || 'Previously selected model',
    tier: 'balanced',
    modelSpec: selected,
  };
}

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

  const allModels = models && models.length > 0 ? models : (() => {
    const fallback = buildFallbackModel(selected);
    return fallback ? [fallback] : [];
  })();

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

  const selectedModel = allModels.find(m => getModelValue(m) === selected || m.id === selected);
  const displayName = selectedModel
    ? `${getModelLabel(selectedModel)}`
    : selected || 'Select model';
  const displayProvider = selectedModel?.providerName || '';
  const pinnedIds = [
    'meta/llama-3.3-70b-instruct',
    'meta/llama-3.2-90b-vision-instruct',
    'meta/llama-3.1-405b-instruct',
    'qwen/qwen2.5-coder-32b-instruct',
    'qwen/qwen2.5-72b-instruct',
    'mistralai/mixtral-8x22b-instruct-v0.1',
    'meta/llama-3.1-8b-instruct',
  ];
  const pinnedModels = allModels.filter((model) => pinnedIds.includes(model.id));

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left text-xs py-2 px-3 rounded cursor-pointer outline-none flex items-center justify-between gap-2"
        style={{
          backgroundColor: 'var(--vscode-input-background)',
          color: 'var(--vscode-input-foreground)',
          border: '1px solid var(--vscode-input-border, transparent)',
        }}
      >
        <span className="min-w-0 flex flex-col truncate">
          <span className="truncate text-[11px] font-medium">{displayName}</span>
          {displayProvider && (
            <span className="opacity-45 text-[10px] truncate">{displayProvider}</span>
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
            maxHeight: '420px',
          }}
        >
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

          <div className="overflow-y-auto" style={{ maxHeight: '370px' }}>
            {!search.trim() && pinnedModels.length > 0 && (
              <div>
                <div
                  className="text-[10px] font-semibold px-2.5 py-1.5 uppercase tracking-wider opacity-50 sticky top-0"
                  style={{ backgroundColor: 'var(--vscode-dropdown-background, var(--vscode-input-background))' }}
                >
                  Recommended
                </div>
                {pinnedModels.map((m) => (
                  <button
                    key={`pinned-${m.providerId}::${m.id}`}
                    onClick={() => {
                      onChange(getModelValue(m));
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className="w-full text-left px-2.5 py-2 text-xs hover:opacity-90 flex items-center gap-2 transition-colors"
                    style={{
                      backgroundColor: getModelValue(m) === selected || m.id === selected
                        ? 'var(--vscode-list-activeSelectionBackground, rgba(255,255,255,0.1))'
                        : 'transparent',
                      color: getModelValue(m) === selected || m.id === selected
                        ? 'var(--vscode-list-activeSelectionForeground, inherit)'
                        : 'inherit',
                    }}
                  >
                    <span className="flex-shrink-0 w-4 text-center text-[10px]">{tierIcon[m.tier] || ''}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium">{getModelLabel(m)}</span>
                      <span className="block truncate text-[9px] opacity-45">{getModelUsage(m)} · {m.providerName}</span>
                    </span>
                    {(getModelValue(m) === selected || m.id === selected) && <span className="text-[11px]">✓</span>}
                  </button>
                ))}
              </div>
            )}

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
                      onChange(getModelValue(m));
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className="w-full text-left px-2.5 py-2 text-xs hover:opacity-90 flex items-center gap-2 transition-colors"
                    style={{
                      backgroundColor: getModelValue(m) === selected || m.id === selected
                        ? 'var(--vscode-list-activeSelectionBackground, rgba(255,255,255,0.1))'
                        : 'transparent',
                      color: getModelValue(m) === selected || m.id === selected
                        ? 'var(--vscode-list-activeSelectionForeground, inherit)'
                        : 'inherit',
                    }}
                  >
                    <span className="flex-shrink-0 w-4 text-center text-[10px]">{tierIcon[m.tier] || ''}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium">{getModelLabel(m)}</span>
                      <span className="block truncate text-[9px] opacity-45">
                        {getModelUsage(m)} · {m.providerName}
                      </span>
                    </span>
                    <span className="flex-shrink-0 flex items-center gap-1">
                      {m.free && (
                        <span className="text-[9px] px-1 py-0 rounded" style={{ background: 'rgba(76, 175, 80, 0.2)', color: '#4caf50' }}>FREE</span>
                      )}
                      {m.contextWindow >= 100000 && (
                        <span className="text-[9px] px-1 py-0 rounded opacity-50" style={{ background: 'var(--vscode-badge-background)' }}>
                          {formatContext(m.contextWindow)}
                        </span>
                      )}
                      {(getModelValue(m) === selected || m.id === selected) && <span className="text-[11px]">✓</span>}
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
