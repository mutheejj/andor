import React from 'react';
import { ArrowLeft, Search } from 'lucide-react';

interface MarketplaceItem {
  id: string;
  title: string;
  author: string;
  description: string;
  tags: string[];
}

interface MarketplaceViewProps {
  onBack: () => void;
}

const modeItems: MarketplaceItem[] = [
  {
    id: 'mode-code-reviewer',
    title: 'Code Reviewer',
    author: '@olearycrew',
    description: 'Senior software engineer conducting thorough code reviews',
    tags: ['Review', 'Quality'],
  },
  {
    id: 'mode-code-simplifier',
    title: 'Code Simplifier',
    author: '@cau1k',
    description: 'For simplifying and refactoring features of codebase',
    tags: ['Refactor', 'Quality'],
  },
  {
    id: 'mode-documentation-specialist',
    title: 'Documentation Specialist',
    author: '@olearycrew',
    description: 'Focus on writing documentation, markdown files, and other text-heavy work',
    tags: ['Docs', 'Writing'],
  },
];

const skillItems: MarketplaceItem[] = [
  {
    id: 'skill-competitive-ads',
    title: 'Competitive Ads Extractor',
    author: '@community',
    description: 'Extracts and analyzes competitors’ ads to understand messaging and creative patterns.',
    tags: ['Business Marketing'],
  },
  {
    id: 'skill-domain-brainstormer',
    title: 'Domain Name Brainstormer',
    author: '@community',
    description: 'Generates creative domain name ideas and checks availability across common TLDs.',
    tags: ['Business Marketing'],
  },
  {
    id: 'skill-internal-comms',
    title: 'Internal Comms',
    author: '@community',
    description: 'A reusable skill for internal updates, newsletters, status reports, and FAQs.',
    tags: ['Communication Writing'],
  },
];

export function MarketplaceView({ onBack }: MarketplaceViewProps) {
  const [tab, setTab] = React.useState<'mcp' | 'modes' | 'skills'>('modes');
  const [query, setQuery] = React.useState('');
  const [showInstalledOnly, setShowInstalledOnly] = React.useState(false);
  const [installedModes, setInstalledModes] = React.useState<string[]>(['mode-code-reviewer']);
  const [installedSkills, setInstalledSkills] = React.useState<string[]>(['skill-internal-comms']);
  const items = tab === 'skills' ? skillItems : modeItems;
  const installedItems = tab === 'skills' ? installedSkills : installedModes;
  const filteredItems = items.filter((item) => {
    const matchesQuery = !query.trim() || `${item.title} ${item.description} ${item.tags.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesInstalled = !showInstalledOnly || installedItems.includes(item.id);
    return matchesQuery && matchesInstalled;
  });

  const toggleInstall = (itemId: string) => {
    if (tab === 'skills') {
      setInstalledSkills((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
      return;
    }
    setInstalledModes((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
  };

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--vscode-sideBar-background)', color: 'var(--vscode-foreground)' }}>
      <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <button onClick={onBack} className="opacity-75 hover:opacity-100">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-xl font-semibold">Andor Marketplace</h2>
      </div>

      <div className="px-4 py-4">
        <div className="mb-4 flex items-center gap-8 border-b" style={{ borderColor: 'var(--vscode-panel-border)' }}>
          {['mcp', 'modes', 'skills'].map((value) => (
            <button
              key={value}
              onClick={() => setTab(value as 'mcp' | 'modes' | 'skills')}
              className="border-b-2 px-1 pb-2 pt-1 text-sm capitalize"
              style={{
                borderColor: tab === value ? 'var(--vscode-button-background)' : 'transparent',
                color: tab === value ? 'var(--vscode-foreground)' : 'rgba(255,255,255,0.7)',
              }}
            >
              {value}
            </button>
          ))}
        </div>

        <p className="mb-4 text-sm opacity-70">
          {tab === 'skills'
            ? 'Browse reusable skills that extend Andor for focused tasks.'
            : 'These modes are available from the community. Click install to adopt them in Andor.'}
        </p>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-md px-3 py-2" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
            <Search size={16} className="opacity-50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
              placeholder={tab === 'skills' ? 'Search skills...' : 'Search modes...'}
            />
          </div>
          <button
            onClick={() => setShowInstalledOnly(false)}
            className="rounded-md px-3 py-2 text-sm"
            style={{ background: !showInstalledOnly ? 'var(--vscode-button-background)' : 'var(--vscode-input-background)', color: !showInstalledOnly ? 'var(--vscode-button-foreground)' : 'inherit', border: '1px solid var(--vscode-panel-border)' }}
          >
            All Items
          </button>
          <button
            onClick={() => setShowInstalledOnly(true)}
            className="rounded-md px-3 py-2 text-sm"
            style={{ background: showInstalledOnly ? 'var(--vscode-button-background)' : 'var(--vscode-input-background)', color: showInstalledOnly ? 'var(--vscode-button-foreground)' : 'inherit', border: '1px solid var(--vscode-panel-border)' }}
          >
            Installed
          </button>
          <div className="rounded-md px-3 py-2 text-sm" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
            Filter by tags
          </div>
        </div>

        <div className="space-y-4 overflow-y-auto pb-6">
          {tab === 'mcp' && (
            <div className="rounded-xl p-4 text-sm opacity-70" style={{ border: '1px solid var(--vscode-panel-border)', background: 'rgba(255,255,255,0.02)' }}>
              MCP marketplace integration is planned for the next pass.
            </div>
          )}

          {tab !== 'mcp' && filteredItems.map((item) => {
            const isInstalled = installedItems.includes(item.id);
            return (
              <div key={item.id} className="rounded-2xl p-5" style={{ border: '1px solid var(--vscode-panel-border)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-semibold leading-tight">{item.title}</h3>
                    <div className="text-sm opacity-60">{tab === 'skills' ? 'Skill' : 'Mode'} by {item.author}</div>
                  </div>
                  <button
                    onClick={() => toggleInstall(item.id)}
                    className="rounded-md px-4 py-2 text-sm"
                    style={{ background: isInstalled ? 'var(--vscode-input-background)' : 'var(--vscode-button-background)', color: isInstalled ? 'var(--vscode-foreground)' : 'var(--vscode-button-foreground)', border: `1px solid ${isInstalled ? 'var(--vscode-panel-border)' : 'transparent'}` }}
                  >
                    {isInstalled ? 'Manage' : 'Install'}
                  </button>
                </div>
                <p className="mb-4 text-base leading-relaxed opacity-85">{item.description}</p>
                {isInstalled && (
                  <div className="mb-3 rounded-md px-3 py-2 text-sm" style={{ background: 'rgba(0, 122, 204, 0.12)', border: '1px solid rgba(0, 122, 204, 0.25)' }}>
                    Installed and available inside Andor.
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <span key={tag} className="rounded-md px-2 py-1 text-xs" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          {tab !== 'mcp' && filteredItems.length === 0 && (
            <div className="rounded-xl p-4 text-sm opacity-70" style={{ border: '1px solid var(--vscode-panel-border)', background: 'rgba(255,255,255,0.02)' }}>
              No marketplace items matched your current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
