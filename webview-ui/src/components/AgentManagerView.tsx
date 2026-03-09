import React from 'react';
import { Cpu, Plus, RefreshCw, FolderOpen, Send } from 'lucide-react';
import type { ChatMessage } from '../App';

interface AgentManagerViewProps {
  messages: ChatMessage[];
  onBackToChat: () => void;
  onSubmitTask: (text: string) => void;
  isLoading: boolean;
}

export function AgentManagerView({ messages, onBackToChat, onSubmitTask, isLoading }: AgentManagerViewProps) {
  const [draft, setDraft] = React.useState('');
  const sessions = React.useMemo(() => {
    const users = messages.filter((message) => message.role === 'user');
    return users.slice(-12).reverse().map((message, index) => ({
      id: message.id,
      title: message.content.slice(0, 42) || 'No user request provided',
      subtitle: new Date(message.timestamp).toLocaleTimeString(),
      preview: message.content,
      active: index === 0,
    }));
  }, [messages]);

  const handleSubmit = () => {
    const next = draft.trim();
    if (!next || isLoading) {
      return;
    }
    onSubmitTask(next);
    setDraft('');
  };

  return (
    <div className="flex h-full" style={{ background: 'var(--vscode-sideBar-background)', color: 'var(--vscode-foreground)' }}>
      <aside className="w-[210px] border-r px-2 py-3" style={{ borderColor: 'var(--vscode-panel-border)' }}>
        <div className="mb-3 text-[11px] font-semibold opacity-80">AGENT MANAGER</div>
        <button
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm"
          style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
        >
          <Plus size={15} />
          <span>New Agent</span>
        </button>

        <div className="mb-2 flex items-center justify-between text-[11px] opacity-55">
          <span>SESSIONS</span>
          <RefreshCw size={13} />
        </div>

        <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-180px)] pr-1">
          {sessions.length === 0 && (
            <div className="rounded-md px-2 py-2 text-[11px] opacity-40" style={{ background: 'var(--vscode-input-background)' }}>
              No sessions yet
            </div>
          )}
          {sessions.map((session) => (
            <button
              key={session.id}
              className="w-full rounded-md px-2 py-2 text-left"
              style={{
                background: session.active ? 'rgba(255,255,255,0.05)' : 'transparent',
                border: `1px solid ${session.active ? 'var(--vscode-panel-border)' : 'transparent'}`,
              }}
            >
              <div className="truncate text-xs font-medium">{session.title}</div>
              <div className="text-[10px] opacity-45">{session.subtitle}</div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 px-5 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu size={18} />
            <h2 className="text-lg font-semibold">Agent Manager</h2>
          </div>
          <button
            onClick={onBackToChat}
            className="rounded-md px-3 py-1.5 text-xs opacity-75 hover:opacity-100"
            style={{ background: 'var(--vscode-input-background)' }}
          >
            Back to Chat
          </button>
        </div>

        <div className="mx-auto mt-12 max-w-[760px] rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--vscode-panel-border)' }}>
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl" style={{ border: '2px solid #e5e75a', color: '#e5e75a' }}>
              <Cpu size={24} />
            </div>
          </div>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Describe the agent task, then send it to Andor..."
            className="mb-4 min-h-[180px] w-full resize-none rounded-xl px-4 py-4 text-sm outline-none"
            style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)' }}
          />
          <div className="flex items-center justify-end gap-2 text-[11px] opacity-70">
            <button className="rounded-md px-2 py-1.5" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
              <FolderOpen size={14} />
            </button>
            <button className="rounded-md px-2 py-1.5" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
              Code
            </button>
            <button className="rounded-md px-2 py-1.5" style={{ background: 'rgba(255, 193, 7, 0.12)', border: '1px solid rgba(255, 193, 7, 0.35)', color: '#f2c94c' }}>
              ⚡
            </button>
            <button className="rounded-md px-2 py-1.5" style={{ background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-panel-border)' }}>
              1
            </button>
            <button
              onClick={handleSubmit}
              disabled={!draft.trim() || isLoading}
              className="rounded-md px-2 py-1.5 disabled:opacity-50"
              style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
