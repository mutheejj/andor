import React, { useState, useEffect, useCallback } from 'react';

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

type Tab = 'providers' | 'services' | 'memory' | 'indexing' | 'allowlist';

interface AdvancedSettingsProps {
  postMessage: (msg: unknown) => void;
  onClose: () => void;
  memory?: unknown;
  indexingStatus?: { state: string; totalFiles: number; indexedFiles: number; message: string };
}

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

  const mem = memory as any;

  useEffect(() => {
    postMessage({ type: 'getProviders' });
    postMessage({ type: 'getServiceKeys' });
    postMessage({ type: 'getMemory' });
  }, [postMessage]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'providers') setProviders(msg.providers || []);
      else if (msg.type === 'serviceKeys') setServiceKeys(msg.keys || {});
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
    { id: 'providers', label: 'AI Providers', icon: '🤖' },
    { id: 'services', label: 'Services', icon: '🔌' },
    { id: 'memory', label: 'Memory', icon: '🧠' },
    { id: 'indexing', label: 'Indexing', icon: '📁' },
    { id: 'allowlist', label: 'Allowlist', icon: '✅' },
  ];

  const statusDot = (s: string) =>
    s === 'configured' ? '🟢' : s === 'untested' ? '🟡' : '⚫';

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--vscode-sideBar-background)', color: 'var(--vscode-foreground)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">⚙ Advanced Settings</span>
        </div>
        <button
          onClick={onClose}
          className="text-[10px] px-2 py-1 rounded opacity-70 hover:opacity-100"
          style={{ background: 'var(--vscode-input-background)' }}
        >
          ← Back
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex px-2 py-1 gap-0.5 flex-shrink-0 flex-wrap" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="text-[10px] px-2 py-1 rounded transition-colors flex items-center gap-1"
            style={{
              background: tab === t.id ? 'var(--vscode-button-background)' : 'transparent',
              color: tab === t.id ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
              opacity: tab === t.id ? 1 : 0.6,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {/* === AI PROVIDERS === */}
        {tab === 'providers' && (
          <div className="space-y-2">
            <div className="text-[10px] opacity-40 mb-2">Configure API keys for AI providers. Keys are stored securely in VS Code's SecretStorage.</div>
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
                  <div className="flex items-center gap-1">
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
                )}
              </div>
            ))}
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
          <div className="space-y-3">
            <div className="rounded p-2.5" style={{ border: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-input-background)' }}>
              <div className="text-[10px] font-semibold opacity-60 mb-2">Workspace Index</div>
              {indexingStatus && (
                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] px-2 py-0.5 rounded font-medium"
                      style={{
                        background: indexingStatus.state === 'ready' ? '#1e4a2e' : indexingStatus.state === 'indexing' ? '#2a3a4a' : indexingStatus.state === 'error' ? '#4a1e1e' : 'var(--vscode-badge-background)',
                        color: indexingStatus.state === 'ready' ? '#4ec9b0' : indexingStatus.state === 'error' ? '#f48771' : 'var(--vscode-badge-foreground)',
                      }}
                    >
                      {indexingStatus.state === 'ready' ? '✓ Ready' : indexingStatus.state === 'indexing' ? '⟳ Indexing...' : indexingStatus.state === 'error' ? '✗ Error' : '○ Idle'}
                    </span>
                    {indexingStatus.indexedFiles > 0 && (
                      <span className="text-[10px] opacity-50">{indexingStatus.indexedFiles} files indexed</span>
                    )}
                  </div>
                  {indexingStatus.message && <div className="text-[10px] opacity-50">{indexingStatus.message}</div>}
                </div>
              )}
              <button
                onClick={() => postMessage({ type: 'reindexWorkspace' })}
                className="text-[10px] px-3 py-1.5 rounded w-full font-medium"
                style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
              >
                ⟳ Re-index Workspace
              </button>
            </div>
            <div className="rounded p-2.5" style={{ border: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-input-background)' }}>
              <div className="text-[10px] font-semibold opacity-60 mb-1.5">Context Settings</div>
              <div className="text-[10px] opacity-50 space-y-1">
                <div>• Only relevant files are included in prompts (based on query similarity)</div>
                <div>• Irrelevant files are excluded to save tokens</div>
                <div>• Re-indexing scans all files from the project root</div>
                <div>• Index is updated automatically when files change</div>
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
  );
}
