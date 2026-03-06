import React, { useState, useEffect, useCallback } from 'react';
import type { PostMessageFn } from '../App';

export interface ProviderInfo {
  id: string;
  name: string;
  hasKey: boolean;
  modelCount: number;
  status: 'configured' | 'unconfigured' | 'untested';
}

interface SettingsPanelProps {
  postMessage: PostMessageFn;
  onClose: () => void;
}

const PROVIDER_LINKS: Record<string, string> = {
  nvidia: 'https://build.nvidia.com/',
  groq: 'https://console.groq.com/keys',
  google: 'https://aistudio.google.com/apikey',
  mistral: 'https://console.mistral.ai/api-keys/',
  openrouter: 'https://openrouter.ai/keys',
};

const statusDot: Record<string, string> = {
  configured: '🟢',
  untested: '🟡',
  unconfigured: '⚫',
};

export function SettingsPanel({ postMessage, onClose }: SettingsPanelProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [allowlistPatterns, setAllowlistPatterns] = useState<string[]>([]);
  const [newPattern, setNewPattern] = useState('');

  useEffect(() => {
    postMessage({ type: 'getProviders' });
  }, [postMessage]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'providers') {
        setProviders(msg.providers || []);
      } else if (msg.type === 'apiKeyStored') {
        postMessage({ type: 'getProviders' });
        setEditingKey(null);
        setKeyInput('');
      } else if (msg.type === 'apiKeyDeleted') {
        postMessage({ type: 'getProviders' });
      } else if (msg.type === 'providerTestResult') {
        setTestingProvider(null);
        if (msg.success) {
          // Update provider status locally
          setProviders(prev => prev.map(p =>
            p.id === msg.providerId ? { ...p, status: 'configured' as const } : p
          ));
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [postMessage]);

  const handleSaveKey = useCallback((providerId: string) => {
    if (!keyInput.trim()) { return; }
    postMessage({ type: 'setApiKey', providerId, apiKey: keyInput.trim() });
  }, [keyInput, postMessage]);

  const handleDeleteKey = useCallback((providerId: string) => {
    postMessage({ type: 'deleteApiKey', providerId });
  }, [postMessage]);

  const handleTestConnection = useCallback((providerId: string) => {
    setTestingProvider(providerId);
    postMessage({ type: 'testProvider', providerId });
  }, [postMessage]);

  return (
    <div className="flex flex-col h-full overflow-y-auto px-3 py-3" style={{ background: 'var(--vscode-sideBar-background)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold" style={{ color: 'var(--vscode-foreground)' }}>Settings</span>
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 rounded opacity-70 hover:opacity-100"
          style={{ background: 'var(--vscode-input-background)' }}
        >
          ✕ Close
        </button>
      </div>

      {/* Provider Cards */}
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-50 mb-2">AI Providers</div>
      <div className="space-y-2 mb-4">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className="rounded p-2.5"
            style={{ border: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-input-background)' }}
          >
            {/* Provider header */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]">{statusDot[provider.status] || '⚫'}</span>
                <span className="text-xs font-semibold">{provider.name}</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded opacity-60" style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>
                {provider.status === 'configured' ? 'Configured' :
                 provider.status === 'untested' ? 'Untested' : 'Not configured'}
              </span>
            </div>
            <div className="text-[10px] opacity-50 mb-2">{provider.modelCount} models available</div>

            {/* Puter is always configured, no key needed */}
            {provider.id === 'puter' ? (
              <div className="text-[10px] opacity-60">Default provider — no API key needed</div>
            ) : (
              <>
                {/* API Key section */}
                {editingKey === provider.id ? (
                  <div className="space-y-1.5">
                    <input
                      type="password"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder="Paste API key..."
                      className="w-full text-xs py-1 px-2 rounded outline-none"
                      style={{
                        backgroundColor: 'var(--vscode-editor-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-focusBorder)',
                      }}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') { handleSaveKey(provider.id); } }}
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleSaveKey(provider.id)}
                        className="text-[10px] px-2 py-0.5 rounded"
                        style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingKey(null); setKeyInput(''); }}
                        className="text-[10px] px-2 py-0.5 rounded opacity-60"
                        style={{ background: 'var(--vscode-input-background)' }}
                      >
                        Cancel
                      </button>
                      {PROVIDER_LINKS[provider.id] && (
                        <button
                          onClick={() => {
                            const vscode = (window as any).__vscode;
                            vscode?.postMessage({ type: 'openExternal', url: PROVIDER_LINKS[provider.id] });
                          }}
                          className="text-[10px] px-2 py-0.5 rounded opacity-60 hover:opacity-100"
                          style={{ background: 'var(--vscode-input-background)' }}
                        >
                          Get Key ↗
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {provider.hasKey ? (
                      <>
                        <span className="text-[10px] opacity-50 flex-1">
                          API Key: {showKey[provider.id] ? '(stored securely)' : '••••••••••••'}
                        </span>
                        <button
                          onClick={() => setShowKey(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                          className="text-[9px] px-1.5 py-0.5 rounded opacity-60 hover:opacity-100"
                          style={{ background: 'var(--vscode-input-background)' }}
                        >
                          {showKey[provider.id] ? 'Hide' : 'Show'}
                        </button>
                        <button
                          onClick={() => handleDeleteKey(provider.id)}
                          className="text-[9px] px-1.5 py-0.5 rounded opacity-60 hover:opacity-100"
                          style={{ background: 'var(--vscode-input-background)' }}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => handleTestConnection(provider.id)}
                          disabled={testingProvider === provider.id}
                          className="text-[9px] px-1.5 py-0.5 rounded opacity-70 hover:opacity-100"
                          style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
                        >
                          {testingProvider === provider.id ? 'Testing...' : 'Test'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setEditingKey(provider.id); setKeyInput(''); }}
                        className="text-[10px] px-2 py-0.5 rounded"
                        style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
                      >
                        Add API Key
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Command Allowlist */}
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-50 mb-2">Command Allowlist</div>
      <div className="rounded p-2.5 mb-4" style={{ border: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-input-background)' }}>
        <div className="text-[10px] opacity-50 mb-2">
          Commands matching these patterns will run without approval.
        </div>
        <div className="space-y-1 mb-2">
          {allowlistPatterns.map((pattern, i) => (
            <div key={i} className="flex items-center justify-between text-[10px] px-2 py-1 rounded" style={{ background: 'var(--vscode-editor-background)' }}>
              <code className="opacity-80" style={{ fontFamily: 'var(--vscode-editor-font-family)' }}>{pattern}</code>
              <button
                onClick={() => setAllowlistPatterns(prev => prev.filter((_, idx) => idx !== i))}
                className="opacity-50 hover:opacity-100 text-[9px]"
              >
                Remove
              </button>
            </div>
          ))}
          {allowlistPatterns.length === 0 && (
            <div className="text-[10px] opacity-40 py-1">No custom patterns. Built-in safe commands are always allowed.</div>
          )}
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            placeholder="e.g. npm install *"
            className="flex-1 text-[10px] py-1 px-2 rounded outline-none"
            style={{
              backgroundColor: 'var(--vscode-editor-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border, transparent)',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newPattern.trim()) {
                setAllowlistPatterns(prev => [...prev, newPattern.trim()]);
                setNewPattern('');
              }
            }}
          />
          <button
            onClick={() => {
              if (newPattern.trim()) {
                setAllowlistPatterns(prev => [...prev, newPattern.trim()]);
                setNewPattern('');
              }
            }}
            className="text-[10px] px-2 py-0.5 rounded"
            style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
          >
            + Add
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="text-[10px] opacity-30 mt-2">
        API keys are stored securely using VS Code's SecretStorage API.
      </div>
    </div>
  );
}
