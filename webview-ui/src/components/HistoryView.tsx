import React from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import type { Checkpoint } from '../App';

interface HistoryViewProps {
  checkpoints: Checkpoint[];
  onBack: () => void;
  onSelect: (checkpointId: string) => void;
}

export function HistoryView({ checkpoints, onBack, onSelect }: HistoryViewProps) {
  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--vscode-sideBar-background)', color: 'var(--vscode-foreground)' }}>
      <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <button onClick={onBack} className="opacity-75 hover:opacity-100">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-semibold">History</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {checkpoints.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center opacity-45">
            <MessageSquare size={30} className="mb-3" />
            <div className="text-sm">No saved checkpoints yet</div>
          </div>
        ) : (
          <div className="space-y-3">
            {[...checkpoints].reverse().map((checkpoint) => (
              <button
                key={checkpoint.id}
                onClick={() => onSelect(checkpoint.id)}
                className="w-full rounded-xl px-4 py-3 text-left"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--vscode-panel-border)' }}
              >
                <div className="mb-1 text-sm font-medium">{checkpoint.label}</div>
                <div className="text-xs opacity-55">
                  {new Date(checkpoint.timestamp).toLocaleString()} · {checkpoint.messages.length} messages
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
