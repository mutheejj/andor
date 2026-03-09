import React from 'react';
import { Plus, Cpu, LayoutGrid, History, CircleUser, Settings as SettingsIcon, ExternalLink } from 'lucide-react';

interface HeaderProps {
  onNewChat: () => void;
  onOpenAgents: () => void;
  onOpenMarketplace: () => void;
  onOpenHistory: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}

export function Header({
  onNewChat,
  onOpenAgents,
  onOpenMarketplace,
  onOpenHistory,
  onOpenProfile,
  onOpenSettings
}: HeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 bg-[var(--vscode-sideBar-background)] border-b border-[var(--vscode-panel-border)]">
      <div className="text-sm font-semibold tracking-wider text-[var(--vscode-foreground)] opacity-90 uppercase">
        ANDOR
      </div>
      <div className="flex items-center gap-3 text-[var(--vscode-foreground)] opacity-70">
        <button onClick={onNewChat} className="hover:opacity-100 transition-opacity" title="New Chat">
          <Plus size={18} strokeWidth={2} />
        </button>
        <button onClick={onOpenAgents} className="hover:opacity-100 transition-opacity" title="Agent Manager">
          <Cpu size={18} strokeWidth={2} />
        </button>
        <button onClick={onOpenMarketplace} className="hover:opacity-100 transition-opacity" title="Marketplace">
          <LayoutGrid size={18} strokeWidth={2} />
        </button>
        <button onClick={onOpenHistory} className="hover:opacity-100 transition-opacity" title="History">
          <History size={18} strokeWidth={2} />
        </button>
        <button onClick={onOpenProfile} className="hover:opacity-100 transition-opacity" title="Profile">
          <CircleUser size={18} strokeWidth={2} />
        </button>
        <button onClick={onOpenSettings} className="hover:opacity-100 transition-opacity" title="Settings">
          <SettingsIcon size={18} strokeWidth={2} />
        </button>
        <button className="hover:opacity-100 transition-opacity" title="Open in Editor">
          <ExternalLink size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
