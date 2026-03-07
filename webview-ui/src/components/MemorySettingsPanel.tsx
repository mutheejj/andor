import React, { useState, useEffect } from 'react';

interface MemoryFact {
  fact: string;
  confidence: number;
  timestamp: number;
}

interface MemoryPreference {
  key: string;
  value: string;
  timestamp: number;
}

interface TaskHistoryItem {
  id: string;
  description: string;
  filesChanged: string[];
  timestamp: number;
  success: boolean;
}

interface ProjectMemoryData {
  projectId: string;
  techStack: {
    languages: string[];
    frameworks: string[];
    buildTools: string[];
    packageManager?: string;
    runtime?: string;
  };
  learnedFacts: MemoryFact[];
  userPreferences: MemoryPreference[];
  taskHistory: TaskHistoryItem[];
  lastUpdated: number;
}

interface MemorySettingsPanelProps {
  postMessage: (msg: unknown) => void;
  onClose: () => void;
  memory?: ProjectMemoryData | null;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function MemorySettingsPanel({ postMessage, onClose, memory }: MemorySettingsPanelProps) {
  const [tab, setTab] = useState<'facts' | 'prefs' | 'history' | 'stack'>('facts');
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClearMemory = () => {
    if (confirmClear) {
      postMessage({ type: 'clearMemory' });
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  const tabs = [
    { id: 'facts' as const, label: 'Learned Facts', count: memory?.learnedFacts?.length || 0 },
    { id: 'prefs' as const, label: 'Preferences', count: memory?.userPreferences?.length || 0 },
    { id: 'history' as const, label: 'Task History', count: memory?.taskHistory?.length || 0 },
    { id: 'stack' as const, label: 'Tech Stack', count: 0 },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">🧠 Memory</span>
          {memory?.lastUpdated && (
            <span className="text-[9px] opacity-40">Updated {timeAgo(memory.lastUpdated)}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClearMemory}
            className="text-[10px] px-2 py-1 rounded transition-opacity hover:opacity-100"
            style={{
              background: confirmClear ? 'var(--vscode-errorForeground, #f48771)' : 'var(--vscode-input-background)',
              color: confirmClear ? '#fff' : 'var(--vscode-foreground)',
              opacity: 0.8,
            }}
          >
            {confirmClear ? 'Confirm Clear' : 'Clear All'}
          </button>
          <button
            onClick={onClose}
            className="text-[10px] px-2 py-1 rounded opacity-70 hover:opacity-100"
            style={{ background: 'var(--vscode-input-background)', color: 'var(--vscode-foreground)' }}
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex px-2 py-1 gap-0.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="text-[10px] px-2 py-1 rounded transition-colors"
            style={{
              background: tab === t.id ? 'var(--vscode-button-background)' : 'transparent',
              color: tab === t.id ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
              opacity: tab === t.id ? 1 : 0.6,
            }}
          >
            {t.label} {t.count > 0 && <span className="opacity-50">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {!memory ? (
          <div className="text-center opacity-40 text-xs py-8">No memory data available yet</div>
        ) : tab === 'facts' ? (
          <div className="space-y-1.5">
            {memory.learnedFacts.length === 0 ? (
              <div className="text-center opacity-40 text-xs py-8">No learned facts yet. Andor learns as you work together.</div>
            ) : (
              memory.learnedFacts.map((fact, i) => (
                <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded text-[11px]" style={{ background: 'var(--vscode-input-background)' }}>
                  <span className="text-[9px] opacity-40 flex-shrink-0 mt-0.5">●</span>
                  <div className="flex-1">
                    <div className="opacity-80">{fact.fact}</div>
                    <div className="text-[9px] opacity-30 mt-0.5">
                      Confidence: {Math.round(fact.confidence * 100)}% · {timeAgo(fact.timestamp)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : tab === 'prefs' ? (
          <div className="space-y-1.5">
            {memory.userPreferences.length === 0 ? (
              <div className="text-center opacity-40 text-xs py-8">No preferences saved yet.</div>
            ) : (
              memory.userPreferences.map((pref, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px]" style={{ background: 'var(--vscode-input-background)' }}>
                  <span className="font-medium opacity-70 flex-shrink-0">{pref.key}:</span>
                  <span className="opacity-60 truncate">{pref.value}</span>
                  <span className="text-[9px] opacity-30 ml-auto flex-shrink-0">{timeAgo(pref.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        ) : tab === 'history' ? (
          <div className="space-y-1.5">
            {memory.taskHistory.length === 0 ? (
              <div className="text-center opacity-40 text-xs py-8">No task history yet.</div>
            ) : (
              memory.taskHistory.map((task, i) => (
                <div key={i} className="px-2 py-1.5 rounded text-[11px]" style={{ background: 'var(--vscode-input-background)' }}>
                  <div className="flex items-center gap-2">
                    <span style={{ color: task.success ? '#4ec9b0' : '#f48771' }}>
                      {task.success ? '✓' : '✗'}
                    </span>
                    <span className="opacity-80 flex-1 truncate">{task.description}</span>
                    <span className="text-[9px] opacity-30 flex-shrink-0">{timeAgo(task.timestamp)}</span>
                  </div>
                  {task.filesChanged.length > 0 && (
                    <div className="text-[9px] opacity-40 mt-1 pl-5">
                      Files: {task.filesChanged.slice(0, 5).join(', ')}
                      {task.filesChanged.length > 5 && ` +${task.filesChanged.length - 5} more`}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          /* Tech Stack */
          <div className="space-y-3">
            {memory.techStack.languages.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold opacity-50 mb-1">Languages</div>
                <div className="flex flex-wrap gap-1">
                  {memory.techStack.languages.map((lang, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {memory.techStack.frameworks.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold opacity-50 mb-1">Frameworks</div>
                <div className="flex flex-wrap gap-1">
                  {memory.techStack.frameworks.map((fw, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>
                      {fw}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {memory.techStack.buildTools.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold opacity-50 mb-1">Build Tools</div>
                <div className="flex flex-wrap gap-1">
                  {memory.techStack.buildTools.map((tool, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {memory.techStack.packageManager && (
              <div>
                <div className="text-[10px] font-semibold opacity-50 mb-1">Package Manager</div>
                <span className="text-[11px] opacity-70">{memory.techStack.packageManager}</span>
              </div>
            )}
            {memory.techStack.runtime && (
              <div>
                <div className="text-[10px] font-semibold opacity-50 mb-1">Runtime</div>
                <span className="text-[11px] opacity-70">{memory.techStack.runtime}</span>
              </div>
            )}
            {memory.techStack.languages.length === 0 && memory.techStack.frameworks.length === 0 && (
              <div className="text-center opacity-40 text-xs py-8">Tech stack not detected yet. Open a project to start.</div>
            )}
          </div>
        )}
      </div>

      {/* Storage info */}
      <div className="px-3 py-1.5 flex-shrink-0 text-[9px] opacity-30" style={{ borderTop: '1px solid var(--vscode-panel-border)' }}>
        Project ID: {memory?.projectId?.slice(0, 8) || 'N/A'} · Stored in VS Code global storage (not in project)
      </div>
    </div>
  );
}
