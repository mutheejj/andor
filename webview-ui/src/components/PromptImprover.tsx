import React, { useState } from 'react';

interface PromptImproverProps {
  inputText: string;
  onImproved: (improvedText: string) => void;
  postMessage: (msg: any) => void;
  selectedModel?: string;
  disabled?: boolean;
}

export function PromptImprover({ inputText, onImproved, postMessage, selectedModel, disabled }: PromptImproverProps) {
  const [isImproving, setIsImproving] = useState(false);
  const [improved, setImproved] = useState<string | null>(null);

  const handleImprove = () => {
    if (!inputText.trim() || isImproving) return;

    setIsImproving(true);
    setImproved(null);

    // Send to extension for processing with selected model
    postMessage({
      type: 'improvePrompt',
      text: inputText.trim(),
      model: selectedModel,
    });

    // Listen for response
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'improvedPrompt' && msg.text) {
        setImproved(msg.text);
        setIsImproving(false);
        window.removeEventListener('message', handler);
      }
    };
    window.addEventListener('message', handler);

    // Timeout after 15s
    setTimeout(() => {
      setIsImproving(false);
      window.removeEventListener('message', handler);
    }, 15000);
  };

  const handleAccept = () => {
    if (improved) {
      onImproved(improved);
      setImproved(null);
    }
  };

  const handleDismiss = () => {
    setImproved(null);
  };

  return (
    <div className="relative">
      {/* Improve button */}
      <button
        onClick={handleImprove}
        disabled={disabled || !inputText.trim() || isImproving}
        className="px-2 py-2 rounded text-sm transition-opacity hover:opacity-100 opacity-60 disabled:opacity-20 flex-shrink-0"
        style={{
          backgroundColor: 'var(--vscode-input-background)',
          color: 'var(--vscode-foreground)',
          border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
        }}
        title="Improve prompt with AI (makes it more specific and actionable)"
      >
        {isImproving ? (
          <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
        ) : '✨'}
      </button>

      {/* Improved prompt popup */}
      {improved && (
        <div
          className="absolute bottom-full right-0 mb-1 rounded-md shadow-lg overflow-hidden z-50"
          style={{
            width: '320px',
            background: 'var(--vscode-editorWidget-background, #252526)',
            border: '1px solid var(--vscode-editorWidget-border, #454545)',
          }}
        >
          <div
            className="px-2.5 py-1.5 text-[10px] font-medium"
            style={{ background: 'var(--vscode-sideBarSectionHeader-background)' }}
          >
            ✨ Improved Prompt
          </div>
          <div className="px-2.5 py-2 text-[11px] leading-relaxed max-h-40 overflow-y-auto">
            {improved}
          </div>
          <div
            className="flex justify-end gap-1.5 px-2.5 py-1.5"
            style={{ borderTop: '1px solid var(--vscode-panel-border)' }}
          >
            <button
              onClick={handleDismiss}
              className="px-2 py-0.5 rounded text-[9px] opacity-60 hover:opacity-100"
              style={{ background: 'var(--vscode-input-background)' }}
            >
              Dismiss
            </button>
            <button
              onClick={handleAccept}
              className="px-2 py-0.5 rounded text-[9px] font-medium"
              style={{
                background: 'var(--vscode-button-background)',
                color: 'var(--vscode-button-foreground)',
              }}
            >
              Use This
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
