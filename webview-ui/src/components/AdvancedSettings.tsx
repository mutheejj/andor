import React, { useState, useEffect, useCallback } from 'react';

const PROVIDER_HINTS: Record<string, { baseUrl?: string; recommendedModel?: string; note: string }> = {
  nvidia: {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    recommendedModel: 'meta/llama-3.2-90b-vision-instruct',
    note: 'Use Nvidia NIM with an OpenAI-compatible endpoint. Recommended for vision and large-context model access.',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    recommendedModel: 'openrouter/auto',
    note: 'Good fallback for broad model access if you want one provider that routes across many vendors.',
  },
  google: {
    recommendedModel: 'gemini-2.0-flash-exp',
    note: 'Useful for multimodal work and fast reasoning-oriented responses.',
  },
  groq: {
    recommendedModel: 'llama-3.3-70b-versatile',
    note: 'Optimized for low-latency inference and fast coding loops.',
  },
};

interface ProviderInfo {
  id: string;
  name: string;
  hasKey: boolean;
  modelCount: number;
  status: 'configured' | 'unconfigured' | 'untested';
}

interface ServiceKeyInfo {
  id: string;
  name: string;
  description: string;
  docsUrl: string;
  hasKey: boolean;
  optional: boolean;
}

const SERVICE_DEFS: Omit<ServiceKeyInfo, 'hasKey'>[] = [
  {
    id: 'brave',
    name: 'Brave Search API',
    description: 'High-quality web search with up to 2000 free queries/month. Without it, DuckDuckGo is used.',
    docsUrl: 'https://brave.com/search/api/',
    optional: true,
  },
  {
    id: 'vision',
    name: 'Vision / Image Analysis',
    description: 'Enables Andor to describe and analyze images in chat. Uses OpenAI Vision API.',
    docsUrl: 'https://platform.openai.com/api-keys',
    optional: true,
  },
];

const PROVIDER_LINKS: Record<string, string> = {
  nvidia: 'https://build.nvidia.com/',
  groq: 'https://console.groq.com/keys',
  google: 'https://aistudio.google.com/apikey',
  mistral: 'https://console.mistral.ai/api-keys/',
  openrouter: 'https://openrouter.ai/keys',
};

type Tab = 'providers' | 'profile' | 'services' | 'memory' | 'indexing' | 'allowlist';

interface AdvancedSettingsProps {
  postMessage: (msg: unknown) => void;
  onClose: () => void;
  memory?: unknown;
  indexingStatus?: { state: string; totalFiles: number; indexedFiles: number; message: string };
}

interface SettingsState {
  profiles: ConfigProfile[];
  activeProfileId: string;
  indexing: {
    indexingEnabled: boolean;
    searchScoreThreshold: number;
    maximumSearchResults: number;
    embeddingBatchSize: number;
    scannerMaxBatchRetries: number;
  };
}

interface ConfigProfile {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  supportsImages: boolean;
  supportsPromptCaching: boolean;
  inputPrice: number;
  outputPrice: number;
  maxTokens: number;
  contextWindow: number;
  reasoningParameters: boolean;
  sendMaxTokens: boolean;
  enableStreaming: boolean;
  customHeaders: Array<{ key: string; value: string }>;
}

const DEFAULT_PROFILES: ConfigProfile[] = [
  {
    id: 'vision-images',
    name: 'vision - images',
    provider: 'nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.2-90b-vision-instruct',
    supportsImages: true,
    supportsPromptCaching: false,
    inputPrice: 0,
    outputPrice: 0,
    maxTokens: -1,
    contextWindow: 128000,
    reasoningParameters: true,
    sendMaxTokens: false,
    enableStreaming: true,
    customHeaders: [],
  },
];

const INDEXING_DEFAULTS = {
  searchScoreThreshold: 0.3,
  maximumSearchResults: 50,
  embeddingBatchSize: 200,
  scannerMaxBatchRetries: 5,
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AdvancedSettings({ postMessage, onClose, memory, indexingStatus }: AdvancedSettingsProps) {
  const [tab, setTab] = useState<Tab>('providers');
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [serviceKeys, setServiceKeys] = useState<Record<string, boolean>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [allowlistPatterns, setAllowlistPatterns] = useState<string[]>([]);
  const [newPattern, setNewPattern] = useState('');
  const [confirmClearMemory, setConfirmClearMemory] = useState(false);
  const [profiles, setProfiles] = useState<ConfigProfile[]>(DEFAULT_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState<string>(DEFAULT_PROFILES[0].id);
  const [indexingEnabled, setIndexingEnabled] = useState(true);
  const [showIndexingSetup, setShowIndexingSetup] = useState(true);
  const [showIndexingAdvanced, setShowIndexingAdvanced] = useState(true);
  const [searchScoreThreshold, setSearchScoreThreshold] = useState(INDEXING_DEFAULTS.searchScoreThreshold);
  const [maximumSearchResults, setMaximumSearchResults] = useState(INDEXING_DEFAULTS.maximumSearchResults);
  const [embeddingBatchSize, setEmbeddingBatchSize] = useState(INDEXING_DEFAULTS.embeddingBatchSize);
  const [scannerMaxBatchRetries, setScannerMaxBatchRetries] = useState(INDEXING_DEFAULTS.scannerMaxBatchRetries);
  const [indexedFiles, setIndexedFiles] = useState<Array<{ relativePath: string; language: string; size: number }>>([]);

  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0];

  const mem = memory as any;

  useEffect(() => {
    postMessage({ type: 'getProviders' });
    postMessage({ type: 'getServiceKeys' });
    postMessage({ type: 'getMemory' });
    postMessage({ type: 'getSettingsState' });
    postMessage({ type: 'getIndexedFiles' });
  }, [postMessage]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'providers') setProviders(msg.providers || []);
      else if (msg.type === 'serviceKeys') setServiceKeys(msg.keys || {});
      else if (msg.type === 'settingsState' && msg.settingsState) {
        const nextState = msg.settingsState as SettingsState;
        setProfiles(nextState.profiles || DEFAULT_PROFILES);
        setActiveProfileId(nextState.activeProfileId || nextState.profiles?.[0]?.id || DEFAULT_PROFILES[0].id);
        setIndexingEnabled(nextState.indexing?.indexingEnabled ?? true);
        setSearchScoreThreshold(nextState.indexing?.searchScoreThreshold ?? INDEXING_DEFAULTS.searchScoreThreshold);
        setMaximumSearchResults(nextState.indexing?.maximumSearchResults ?? INDEXING_DEFAULTS.maximumSearchResults);
        setEmbeddingBatchSize(nextState.indexing?.embeddingBatchSize ?? INDEXING_DEFAULTS.embeddingBatchSize);
        setScannerMaxBatchRetries(nextState.indexing?.scannerMaxBatchRetries ?? INDEXING_DEFAULTS.scannerMaxBatchRetries);
      }
      else if (msg.type === 'indexedFiles') {
        setIndexedFiles(msg.files || []);
      }
      else if (msg.type === 'apiKeyStored' || msg.type === 'apiKeyDeleted') {
        postMessage({ type: 'getProviders' });
        setEditingKey(null);
        setKeyInput('');
      } else if (msg.type === 'providerTestResult') {
        setTestingProvider(null);
        if (msg.success) {
          setProviders(prev => prev.map(p =>
            p.id === msg.providerId ? { ...p, status: 'configured' as const } : p
          ));
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [postMessage]);

  const saveKey = useCallback((id: string, isService = false) => {
    if (!keyInput.trim()) return;
    if (isService) {
      postMessage({ type: 'setServiceKey', providerId: id, apiKey: keyInput.trim() });
    } else {
      postMessage({ type: 'setApiKey', providerId: id, apiKey: keyInput.trim() });
    }
    setEditingKey(null);
    setKeyInput('');
  }, [keyInput, postMessage]);

  const deleteKey = useCallback((id: string, isService = false) => {
    if (isService) postMessage({ type: 'deleteServiceKey', providerId: id });
    else postMessage({ type: 'deleteApiKey', providerId: id });
  }, [postMessage]);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'providers', label: 'Providers', icon: '🔌' },
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'services', label: 'Services', icon: '🔗' },
    { id: 'memory', label: 'Memory', icon: '🧠' },
    { id: 'indexing', label: 'Indexing', icon: '🗂' },
    { id: 'allowlist', label: 'Allowlist', icon: '✅' },
  ];

  const statusDot = (s: string) =>
    s === 'configured' ? '🟢' : s === 'untested' ? '🟡' : '⚫';

  const updateActiveProfile = (updates: Partial<ConfigProfile>) => {
    setProfiles((current) => current.map((profile) => profile.id === activeProfileId ? { ...profile, ...updates } : profile));
  };

  const saveSettingsState = useCallback(() => {
    postMessage({
      type: 'saveSettingsState',
      settingsState: {
        profiles,
        activeProfileId,
        indexing: {
          indexingEnabled,
          searchScoreThreshold,
          maximumSearchResults,
          embeddingBatchSize,
          scannerMaxBatchRetries,
        },
      },
    });
  }, [activeProfileId, embeddingBatchSize, indexingEnabled, maximumSearchResults, postMessage, profiles, scannerMaxBatchRetries, searchScoreThreshold]);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--vscode-sideBar-background)', color: 'var(--vscode-foreground)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-sm opacity-80 hover:opacity-100">←</button>
          <span className="text-lg font-semibold">Settings</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs px-3 py-1.5 rounded opacity-70 hover:opacity-100" style={{ background: 'var(--vscode-input-background)' }}>⌕</button>
          <button onClick={saveSettingsState} className="text-xs px-3 py-1.5 rounded font-medium" style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}>Save</button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-14 flex-shrink-0 px-2 py-3 flex flex-col items-center gap-2" style={{ borderRight: '1px solid var(--vscode-panel-border)' }}>
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className="w-10 h-10 rounded-md text-sm transition-colors"
              style={{
                background: tab === item.id ? 'rgba(0, 122, 204, 0.22)' : 'transparent',
                color: 'var(--vscode-foreground)',
                border: tab === item.id ? '1px solid rgba(0, 122, 204, 0.35)' : '1px solid transparent',
              }}
              title={item.label}
            >
              {item.icon}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* === AI PROVIDERS === */}
        {tab === 'providers' && (
          <div className="space-y-4 max-w-3xl">
            <div>
              <div className="text-3xl font-semibold mb-4">Providers</div>
              <div className="text-sm opacity-70 mb-6">Configuration Profile</div>
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={activeProfileId}
                  onChange={(e) => setActiveProfileId(e.target.value)}
                  className="flex-1 rounded px-3 py-2 text-sm"
                  style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }}
                >
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.name}{profile.id === activeProfileId ? ' (Active)' : ''}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const nextId = `profile-${Date.now()}`;
                    const nextProfile = { ...activeProfile, id: nextId, name: `${activeProfile.name} copy` };
                    setProfiles((current) => [...current, nextProfile]);
                    setActiveProfileId(nextId);
                  }}
                  className="rounded px-3 py-2 text-sm"
                  style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}
                >
                  +
                </button>
                <button
                  className="rounded px-3 py-2 text-sm"
                  style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}
                >
                  ✎
                </button>
                <button
                  onClick={() => {
                    if (profiles.length === 1) return;
                    const nextProfiles = profiles.filter((profile) => profile.id !== activeProfileId);
                    setProfiles(nextProfiles);
                    setActiveProfileId(nextProfiles[0].id);
                  }}
                  className="rounded px-3 py-2 text-sm"
                  style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}
                >
                  🗑
                </button>
              </div>
              <div className="text-[12px] opacity-65">Save different API configurations to quickly switch between providers and settings.</div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="mb-1 text-sm font-medium">API Provider</div>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <select
                    value={activeProfile.provider}
                    onChange={(e) => updateActiveProfile({ provider: e.target.value })}
                    className="flex-1 rounded px-3 py-2 text-sm"
                    style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }}
                  >
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.name}</option>
                    ))}
                    <option value="openai-compatible">OpenAI Compatible</option>
                  </select>
                  <button
                    onClick={() => postMessage({ type: 'openExternal', url: PROVIDER_LINKS[activeProfile.provider] || PROVIDER_LINKS.nvidia })}
                    className="text-sm whitespace-nowrap"
                    style={{ color: 'var(--vscode-textLink-foreground)' }}
                  >
                    Provider Docs
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1 text-sm font-medium">Base URL</div>
                <input
                  value={activeProfile.baseUrl}
                  onChange={(e) => updateActiveProfile({ baseUrl: e.target.value })}
                  className="w-full rounded px-3 py-2 text-sm"
                  style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }}
                />
              </div>

              <div>
                <div className="mb-1 text-sm font-medium">API Key</div>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="••••••••••••••••••••••••••••••••••••"
                  className="w-full rounded px-3 py-2 text-sm"
                  style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }}
                />
              </div>

              <div>
                <div className="mb-1 text-sm font-medium">Model</div>
                <input
                  value={activeProfile.model}
                  onChange={(e) => updateActiveProfile({ model: e.target.value })}
                  className="w-full rounded px-3 py-2 text-sm"
                  style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }}
                />
                <div className="text-sm opacity-70 mt-3 leading-relaxed">
                  <div>Context Window: {activeProfile.contextWindow.toLocaleString()} tokens</div>
                  <div>{activeProfile.supportsImages ? '✓ Supports images' : '✗ Does not support images'}</div>
                  <div>{activeProfile.supportsPromptCaching ? '✓ Supports prompt caching' : '✗ Does not support prompt caching'}</div>
                  <div>Input price: ${activeProfile.inputPrice.toFixed(2)} / 1M tokens</div>
                  <div>Output price: ${activeProfile.outputPrice.toFixed(2)} / 1M tokens</div>
                  <div className="mt-2">The extension automatically fetches the latest list of models available on OpenAI-compatible providers. If you're unsure which model to choose, Andor works best with `gpt-4o` and Nvidia NIM vision models for multimodal use.</div>
                </div>
              </div>

              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={activeProfile.reasoningParameters} onChange={(e) => updateActiveProfile({ reasoningParameters: e.target.checked })} />
                <span>
                  <div>Enable R1 model parameters</div>
                  <div className="opacity-65 text-[12px]">Must be enabled when using R1 models such as QWQ to prevent 400 errors</div>
                </span>
              </label>

              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={activeProfile.sendMaxTokens} onChange={(e) => updateActiveProfile({ sendMaxTokens: e.target.checked })} />
                <span>
                  <div>Send max output tokens parameter in API requests</div>
                  <div className="opacity-65 text-[12px]">Some providers may not support this.</div>
                </span>
              </label>

              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={activeProfile.enableStreaming} onChange={(e) => updateActiveProfile({ enableStreaming: e.target.checked })} />
                <span>
                  <div>Enable streaming</div>
                  <div className="opacity-65 text-[12px]">Recommended for responsive chat updates and long model outputs.</div>
                </span>
              </label>

              <div>
                <div className="text-sm font-medium mb-1">Custom Headers</div>
                <div className="text-[12px] opacity-65 mb-2">{activeProfile.customHeaders.length === 0 ? 'No custom headers defined. Click the + button to add one.' : 'Custom headers are sent with every request for this profile.'}</div>
                {activeProfile.customHeaders.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {activeProfile.customHeaders.map((header, index) => (
                      <div key={`${header.key}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <input
                          value={header.key}
                          onChange={(e) => updateActiveProfile({ customHeaders: activeProfile.customHeaders.map((item, itemIndex) => itemIndex === index ? { ...item, key: e.target.value } : item) })}
                          placeholder="Header name"
                          className="rounded px-3 py-2 text-sm"
                          style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }}
                        />
                        <input
                          value={header.value}
                          onChange={(e) => updateActiveProfile({ customHeaders: activeProfile.customHeaders.map((item, itemIndex) => itemIndex === index ? { ...item, value: e.target.value } : item) })}
                          placeholder="Header value"
                          className="rounded px-3 py-2 text-sm"
                          style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }}
                        />
                        <button
                          onClick={() => updateActiveProfile({ customHeaders: activeProfile.customHeaders.filter((_, itemIndex) => itemIndex !== index) })}
                          className="rounded px-3 py-2 text-sm"
                          style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => updateActiveProfile({ customHeaders: [...activeProfile.customHeaders, { key: '', value: '' }] })}
                  className="rounded px-3 py-1.5 text-xs"
                  style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}
                >
                  + Add Header
                </button>
              </div>

              <div className="rounded-xl p-4" style={{ border: '1px solid var(--vscode-panel-border)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="text-sm font-medium mb-2">Advanced settings</div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="mb-1">Max tokens</div>
                    <input
                      type="number"
                      value={activeProfile.maxTokens}
                      onChange={(e) => updateActiveProfile({ maxTokens: Number(e.target.value) })}
                      className="w-full rounded px-3 py-2 text-sm"
                      style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }}
                    />
                  </label>
                  <label className="text-sm">
                    <div className="mb-1">Context window</div>
                    <input
                      type="number"
                      value={activeProfile.contextWindow}
                      onChange={(e) => updateActiveProfile({ contextWindow: Number(e.target.value) })}
                      className="w-full rounded px-3 py-2 text-sm"
                      style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={activeProfile.supportsImages} onChange={(e) => updateActiveProfile({ supportsImages: e.target.checked })} />
                    <span>Supports images</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={activeProfile.supportsPromptCaching} onChange={(e) => updateActiveProfile({ supportsPromptCaching: e.target.checked })} />
                    <span>Supports prompt caching</span>
                  </label>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => updateActiveProfile(DEFAULT_PROFILES[0])}
                    className="rounded px-3 py-2 text-sm"
                    style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}
                  >
                    Reset to Defaults
                  </button>
                  <button
                    onClick={() => saveKey(activeProfile.provider === 'openai-compatible' ? 'nvidia' : activeProfile.provider)}
                    className="rounded px-3 py-2 text-sm font-medium"
                    style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
                  >
                    Save Provider Configuration
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4" style={{ borderTop: '1px solid var(--vscode-panel-border)' }}>
            {providers.map(p => (
              <div key={p.id} className="rounded p-2.5" style={{ border: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-input-background)' }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]">{statusDot(p.status)}</span>
                    <span className="text-xs font-semibold">{p.name}</span>
                    <span className="text-[9px] opacity-40">{p.modelCount} models</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded opacity-60" style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>
                    {p.status === 'configured' ? 'Active' : p.status === 'untested' ? 'Key set' : 'No key'}
                  </span>
                </div>
                {p.id === 'puter' ? (
                  <div className="text-[10px] opacity-50">Always available via Puter.com — no key needed.</div>
                ) : editingKey === p.id ? (
                  <div className="space-y-1">
                    {PROVIDER_HINTS[p.id] && (
                      <div className="rounded px-2 py-2 text-[10px] opacity-80" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--vscode-panel-border)' }}>
                        <div className="font-semibold mb-1">Recommended setup</div>
                        <div>{PROVIDER_HINTS[p.id].note}</div>
                        {PROVIDER_HINTS[p.id].baseUrl && <div className="mt-1">Base URL: <code>{PROVIDER_HINTS[p.id].baseUrl}</code></div>}
                        {PROVIDER_HINTS[p.id].recommendedModel && <div className="mt-1">Suggested model: <code>{PROVIDER_HINTS[p.id].recommendedModel}</code></div>}
                      </div>
                    )}
                    <input
                      type="password"
                      value={keyInput}
                      onChange={e => setKeyInput(e.target.value)}
                      placeholder="Paste API key..."
                      autoFocus
                      className="w-full text-xs py-1 px-2 rounded outline-none"
                      style={{ background: 'var(--vscode-editor-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-focusBorder)' }}
                      onKeyDown={e => e.key === 'Enter' && saveKey(p.id)}
                    />
                    <div className="flex gap-1">
                      <button onClick={() => saveKey(p.id)} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}>Save</button>
                      <button onClick={() => { setEditingKey(null); setKeyInput(''); }} className="text-[10px] px-2 py-0.5 rounded opacity-60" style={{ background: 'var(--vscode-input-background)' }}>Cancel</button>
                      {PROVIDER_LINKS[p.id] && (
                        <button onClick={() => postMessage({ type: 'openExternal', url: PROVIDER_LINKS[p.id] })} className="text-[10px] px-2 py-0.5 rounded opacity-60 hover:opacity-100" style={{ background: 'var(--vscode-input-background)' }}>Get Key ↗</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {PROVIDER_HINTS[p.id] && (
                      <div className="text-[10px] opacity-60 leading-relaxed">
                        {PROVIDER_HINTS[p.id].note}
                        {PROVIDER_HINTS[p.id].recommendedModel && (
                          <span> Recommended model: <code>{PROVIDER_HINTS[p.id].recommendedModel}</code>.</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-1 flex-wrap">
                      {p.hasKey ? (
                        <>
                          <span className="text-[10px] opacity-40 flex-1">Key stored securely</span>
                          <button onClick={() => { setEditingKey(p.id); setKeyInput(''); }} className="text-[9px] px-1.5 py-0.5 rounded opacity-60 hover:opacity-100" style={{ background: 'var(--vscode-input-background)' }}>Update</button>
                          <button onClick={() => deleteKey(p.id)} className="text-[9px] px-1.5 py-0.5 rounded opacity-60 hover:opacity-100" style={{ background: 'var(--vscode-input-background)' }}>Delete</button>
                          <button onClick={() => { setTestingProvider(p.id); postMessage({ type: 'testProvider', providerId: p.id }); }} disabled={testingProvider === p.id} className="text-[9px] px-1.5 py-0.5 rounded opacity-70 hover:opacity-100" style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}>{testingProvider === p.id ? 'Testing...' : 'Test'}</button>
                        </>
                      ) : (
                        <button onClick={() => { setEditingKey(p.id); setKeyInput(''); }} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}>+ Add Key</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            </div>
          </div>
        )}

        {tab === 'profile' && (
          <div className="max-w-3xl space-y-4">
            <div className="text-3xl font-semibold">Profile</div>
            <div className="rounded-2xl p-5" style={{ border: '1px solid var(--vscode-panel-border)', background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-lg font-medium">Andor Account</div>
                  <div className="text-sm opacity-65">Manage your session, providers, and usage preferences.</div>
                </div>
                <div className="h-14 w-14 rounded-full flex items-center justify-center text-xl" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
                  👤
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl p-4" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
                  <div className="text-sm font-medium mb-1">Identity</div>
                  <div className="text-sm opacity-70">Connected through your current Andor/Puter auth session.</div>
                </div>
                <div className="rounded-xl p-4" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
                  <div className="text-sm font-medium mb-1">Active Profile</div>
                  <div className="text-sm opacity-70">{activeProfile.name}</div>
                </div>
                <div className="rounded-xl p-4" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
                  <div className="text-sm font-medium mb-1">Primary Provider</div>
                  <div className="text-sm opacity-70">{activeProfile.provider}</div>
                </div>
                <div className="rounded-xl p-4" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
                  <div className="text-sm font-medium mb-1">Model</div>
                  <div className="text-sm opacity-70">{activeProfile.model}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === SERVICES (Brave, Vision) === */}
        {tab === 'services' && (
          <div className="space-y-3">
            <div className="text-[10px] opacity-40 mb-2">Optional API keys for extra capabilities. These are separate from AI provider keys.</div>
            {SERVICE_DEFS.map(svc => {
              const hasKey = serviceKeys[svc.id] || false;
              return (
                <div key={svc.id} className="rounded p-2.5" style={{ border: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-input-background)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px]">{hasKey ? '🟢' : '⚫'}</span>
                      <span className="text-xs font-semibold">{svc.name}</span>
                      {svc.optional && <span className="text-[9px] opacity-40 italic">optional</span>}
                    </div>
                  </div>
                  <p className="text-[10px] opacity-60 mb-2">{svc.description}</p>
                  {editingKey === `svc_${svc.id}` ? (
                    <div className="space-y-1">
                      <input
                        type="password"
                        value={keyInput}
                        onChange={e => setKeyInput(e.target.value)}
                        placeholder="Paste API key..."
                        autoFocus
                        className="w-full text-xs py-1 px-2 rounded outline-none"
                        style={{ background: 'var(--vscode-editor-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-focusBorder)' }}
                        onKeyDown={e => e.key === 'Enter' && saveKey(svc.id, true)}
                      />
                      <div className="flex gap-1">
                        <button onClick={() => saveKey(svc.id, true)} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}>Save</button>
                        <button onClick={() => { setEditingKey(null); setKeyInput(''); }} className="text-[10px] px-2 py-0.5 rounded opacity-60" style={{ background: 'var(--vscode-input-background)' }}>Cancel</button>
                        <button onClick={() => postMessage({ type: 'openExternal', url: svc.docsUrl })} className="text-[10px] px-2 py-0.5 rounded opacity-60 hover:opacity-100" style={{ background: 'var(--vscode-input-background)' }}>Get Key ↗</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {hasKey ? (
                        <>
                          <span className="text-[10px] opacity-40 flex-1">Key stored securely</span>
                          <button onClick={() => { setEditingKey(`svc_${svc.id}`); setKeyInput(''); }} className="text-[9px] px-1.5 py-0.5 rounded opacity-60 hover:opacity-100" style={{ background: 'var(--vscode-input-background)' }}>Update</button>
                          <button onClick={() => deleteKey(svc.id, true)} className="text-[9px] px-1.5 py-0.5 rounded opacity-60 hover:opacity-100" style={{ background: 'var(--vscode-input-background)' }}>Delete</button>
                        </>
                      ) : (
                        <button onClick={() => { setEditingKey(`svc_${svc.id}`); setKeyInput(''); }} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}>+ Add Key</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* === MEMORY === */}
        {tab === 'memory' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] opacity-40">Andor learns facts about your project over time.</div>
              <button
                onClick={() => {
                  if (confirmClearMemory) { postMessage({ type: 'clearMemory' }); setConfirmClearMemory(false); }
                  else { setConfirmClearMemory(true); setTimeout(() => setConfirmClearMemory(false), 3000); }
                }}
                className="text-[10px] px-2 py-1 rounded flex-shrink-0"
                style={{
                  background: confirmClearMemory ? 'var(--vscode-errorForeground, #f48771)' : 'var(--vscode-input-background)',
                  color: confirmClearMemory ? '#fff' : 'var(--vscode-foreground)',
                }}
              >
                {confirmClearMemory ? '⚠ Confirm Clear' : 'Clear All Memory'}
              </button>
            </div>

            {!mem ? (
              <div className="text-center opacity-40 text-xs py-8">No memory data yet. Start a project to build memory.</div>
            ) : (
              <>
                {/* Tech Stack */}
                {mem.techStack && (
                  <div className="rounded p-2.5" style={{ border: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-input-background)' }}>
                    <div className="text-[10px] font-semibold opacity-60 mb-2">Tech Stack</div>
                    <div className="flex flex-wrap gap-1">
                      {[...(mem.techStack.languages || []), ...(mem.techStack.frameworks || []), ...(mem.techStack.buildTools || [])].map((tag: string, i: number) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Learned Facts */}
                {mem.learnedFacts?.length > 0 && (
                  <div className="rounded p-2.5" style={{ border: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-input-background)' }}>
                    <div className="text-[10px] font-semibold opacity-60 mb-2">Learned Facts ({mem.learnedFacts.length})</div>
                    <div className="space-y-1">
                      {mem.learnedFacts.slice(0, 10).map((f: any, i: number) => (
                        <div key={i} className="text-[10px] opacity-70 flex gap-1.5">
                          <span className="opacity-30">●</span>
                          <span>{f.fact}</span>
                        </div>
                      ))}
                      {mem.learnedFacts.length > 10 && <div className="text-[10px] opacity-30">+{mem.learnedFacts.length - 10} more...</div>}
                    </div>
                  </div>
                )}
                {/* Task History */}
                {mem.taskHistory?.length > 0 && (
                  <div className="rounded p-2.5" style={{ border: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-input-background)' }}>
                    <div className="text-[10px] font-semibold opacity-60 mb-2">Recent Tasks ({mem.taskHistory.length})</div>
                    <div className="space-y-1">
                      {mem.taskHistory.slice(-8).reverse().map((t: any, i: number) => (
                        <div key={i} className="text-[10px] flex items-center gap-2">
                          <span style={{ color: t.success ? '#4ec9b0' : '#f48771' }}>{t.success ? '✓' : '✗'}</span>
                          <span className="opacity-70 flex-1 truncate">{t.description}</span>
                          <span className="opacity-30 flex-shrink-0">{timeAgo(t.timestamp)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="text-[9px] opacity-30">Project ID: {mem.projectId?.slice(0, 8)} · Stored in VS Code global storage</div>
              </>
            )}
          </div>
        )}

        {/* === INDEXING === */}
        {tab === 'indexing' && (
          <div className="space-y-4 max-w-3xl">
            <div className="text-3xl font-semibold">Codebase Indexing</div>
            <div className="rounded-xl p-5" style={{ border: '1px solid #0e639c', background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-base font-semibold mb-2">Codebase Indexing</div>
              <div className="text-sm opacity-75 mb-4">
                Configure codebase indexing settings to enable semantic search of your project. <button onClick={() => postMessage({ type: 'openExternal', url: 'https://docs.kilocode.ai/' })} style={{ color: 'var(--vscode-textLink-foreground)' }}>Learn more</button>
              </div>

              <label className="flex items-center gap-3 text-sm mb-4">
                <input type="checkbox" checked={indexingEnabled} onChange={(e) => setIndexingEnabled(e.target.checked)} />
                <span>Enable Codebase Indexing</span>
              </label>

              <div className="mb-4">
                <div className="text-sm font-medium mb-1">Status</div>
                <div className="flex items-center gap-2 text-sm opacity-75">
                  <span style={{ color: indexingStatus?.state === 'ready' ? '#4ec9b0' : 'var(--vscode-descriptionForeground)' }}>●</span>
                  <span>{indexingStatus?.state === 'ready' ? 'Index ready' : indexingStatus?.state === 'indexing' ? 'Indexing' : 'Standby'}</span>
                </div>
                {indexingStatus?.message && <div className="mt-2 text-xs opacity-65">{indexingStatus.message}</div>}
              </div>

              <div className="mb-4">
                <button className="text-sm font-medium mb-2 flex items-center gap-2" onClick={() => setShowIndexingSetup((current) => !current)}>
                  <span>{showIndexingSetup ? '▾' : '▸'}</span>
                  <span>Setup</span>
                </button>
                {showIndexingSetup && (
                  <div className="space-y-3 rounded-lg p-4" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
                    <div>
                      <div className="text-sm font-medium mb-1">Embedder Provider</div>
                      <select className="w-full rounded px-3 py-2 text-sm" style={{ background: 'var(--vscode-editor-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }}>
                        <option>Mistral</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-1">API Key</div>
                      <input type="password" value={serviceKeys.mistral ? '••••••••••••••••' : ''} readOnly className="w-full rounded px-3 py-2 text-sm" style={{ background: 'var(--vscode-editor-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }} />
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-1">Model</div>
                      <input value="mistral-embed" readOnly className="w-full rounded px-3 py-2 text-sm" style={{ background: 'var(--vscode-editor-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }} />
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-1">Vector Store Provider</div>
                      <input value="LanceDB" readOnly className="w-full rounded px-3 py-2 text-sm" style={{ background: 'var(--vscode-editor-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }} />
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-1">LanceDB Vector Store Path</div>
                      <input value="~/.kilocode/lancedb" readOnly className="w-full rounded px-3 py-2 text-sm" style={{ background: 'var(--vscode-editor-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-4">
                <button className="text-sm font-medium mb-2 flex items-center gap-2" onClick={() => setShowIndexingAdvanced((current) => !current)}>
                  <span>{showIndexingAdvanced ? '▾' : '▸'}</span>
                  <span>Advanced Configuration</span>
                </button>
                {showIndexingAdvanced && (
                  <div className="space-y-4 rounded-lg p-4" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
                    <label className="block text-sm">
                      <div className="mb-2 flex items-center justify-between"><span>Search Score Threshold</span><span>{searchScoreThreshold.toFixed(2)}</span></div>
                      <input type="range" min="0" max="1" step="0.01" value={searchScoreThreshold} onChange={(e) => setSearchScoreThreshold(Number(e.target.value))} className="w-full" />
                    </label>
                    <label className="block text-sm">
                      <div className="mb-2 flex items-center justify-between"><span>Maximum Search Results</span><span>{maximumSearchResults}</span></div>
                      <input type="range" min="1" max="100" step="1" value={maximumSearchResults} onChange={(e) => setMaximumSearchResults(Number(e.target.value))} className="w-full" />
                    </label>
                    <label className="block text-sm">
                      <div className="mb-2 flex items-center justify-between"><span>Embedding Batch Size</span><span>{embeddingBatchSize}</span></div>
                      <input type="range" min="10" max="500" step="10" value={embeddingBatchSize} onChange={(e) => setEmbeddingBatchSize(Number(e.target.value))} className="w-full" />
                    </label>
                    <label className="block text-sm">
                      <div className="mb-2 flex items-center justify-between"><span>Scanner Max Batch Retries</span><span>{scannerMaxBatchRetries}</span></div>
                      <input type="range" min="1" max="10" step="1" value={scannerMaxBatchRetries} onChange={(e) => setScannerMaxBatchRetries(Number(e.target.value))} className="w-full" />
                    </label>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => postMessage({ type: 'reindexWorkspace' })}
                  disabled={!indexingEnabled}
                  className="text-sm px-4 py-2 rounded font-medium disabled:opacity-50"
                  style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
                >
                  Start Indexing
                </button>
                <button
                  onClick={saveSettingsState}
                  className="text-sm px-4 py-2 rounded font-medium"
                  style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
                >
                  Save
                </button>
              </div>

              <div className="mt-4 rounded-lg p-4" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
                <div className="text-sm font-medium mb-2">How indexing helps Andor</div>
                <div className="text-sm opacity-70 space-y-1">
                  <div>Andor indexes supported source files so it can quickly find the most relevant files for your prompt.</div>
                  <div>It stores file metadata and code structure, then refreshes when files change so context stays current.</div>
                  <div>Ignored directories such as `node_modules`, `dist`, `build`, `.git`, `coverage`, and `vendor` are skipped.</div>
                  <div>This reduces prompt noise, improves code relevance, and helps the extension stay aware of the project layout over time.</div>
                </div>
              </div>

              <div className="mt-4 rounded-lg p-4" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
                <div className="text-sm font-medium mb-2">Indexed files</div>
                <div className="max-h-48 overflow-y-auto space-y-1 text-xs opacity-75">
                  {indexedFiles.length === 0 ? (
                    <div>No indexed files available yet.</div>
                  ) : indexedFiles.slice(0, 120).map((file) => (
                    <div key={file.relativePath} className="flex items-center justify-between gap-3 rounded px-2 py-1" style={{ background: 'var(--vscode-editor-background)' }}>
                      <span className="truncate">{file.relativePath}</span>
                      <span className="opacity-50 whitespace-nowrap">{file.language} · {Math.round(file.size / 1024)} KB</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === ALLOWLIST === */}
        {tab === 'allowlist' && (
          <div className="space-y-2">
            <div className="text-[10px] opacity-40 mb-2">Commands matching these patterns run without user approval.</div>
            <div className="rounded p-2.5" style={{ border: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-input-background)' }}>
              <div className="text-[10px] font-semibold opacity-50 mb-2">Built-in Safe Commands</div>
              <div className="space-y-0.5">
                {['git status/diff/log/branch', 'npm run build/test/lint', 'tsc', 'echo', 'cat', 'ls', 'pwd', 'node --version'].map((p, i) => (
                  <div key={i} className="text-[10px] opacity-40 flex items-center gap-1">
                    <span className="text-[8px]">✓</span>
                    <code style={{ fontFamily: 'var(--vscode-editor-font-family)' }}>{p}</code>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded p-2.5" style={{ border: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-input-background)' }}>
              <div className="text-[10px] font-semibold opacity-50 mb-2">Custom Patterns</div>
              <div className="space-y-1 mb-2">
                {allowlistPatterns.length === 0 ? (
                  <div className="text-[10px] opacity-30 py-1">No custom patterns added.</div>
                ) : allowlistPatterns.map((pat, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px] px-2 py-1 rounded" style={{ background: 'var(--vscode-editor-background)' }}>
                    <code style={{ fontFamily: 'var(--vscode-editor-font-family)' }}>{pat}</code>
                    <button onClick={() => setAllowlistPatterns(prev => prev.filter((_, idx) => idx !== i))} className="opacity-50 hover:opacity-100">✕</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newPattern}
                  onChange={e => setNewPattern(e.target.value)}
                  placeholder="e.g. npm install *"
                  className="flex-1 text-[10px] py-1 px-2 rounded outline-none"
                  style={{ background: 'var(--vscode-editor-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border, transparent)' }}
                  onKeyDown={e => { if (e.key === 'Enter' && newPattern.trim()) { setAllowlistPatterns(prev => [...prev, newPattern.trim()]); setNewPattern(''); } }}
                />
                <button
                  onClick={() => { if (newPattern.trim()) { setAllowlistPatterns(prev => [...prev, newPattern.trim()]); setNewPattern(''); } }}
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
                >
                  + Add
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
