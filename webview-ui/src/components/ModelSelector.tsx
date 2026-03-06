import React from 'react';

interface ModelOption {
  id: string;
  label: string;
  tag: string;
}

const MODELS: ModelOption[] = [
  { id: 'claude-sonnet-4', label: 'Claude Sonnet 4', tag: 'Recommended' },
  { id: 'claude-opus-4', label: 'Claude Opus 4', tag: 'Most capable' },
  { id: 'claude-haiku-4', label: 'Claude Haiku 4', tag: 'Fast & efficient' },
  { id: 'gpt-4o', label: 'GPT-4o', tag: 'Great for code' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', tag: 'Fast • Free tier' },
  { id: 'gpt-4-1', label: 'GPT-4.1', tag: 'Latest GPT' },
  { id: 'o3-mini', label: 'o3-mini', tag: 'Reasoning' },
  { id: 'gemini-2-5-pro', label: 'Gemini 2.5 Pro', tag: 'Recommended' },
  { id: 'gemini-2-5-flash', label: 'Gemini 2.5 Flash', tag: 'Fast • Free tier' },
  { id: 'deepseek-v3', label: 'DeepSeek V3', tag: 'Open source • Free tier' },
  { id: 'deepseek-r1', label: 'DeepSeek R1', tag: 'Reasoning' },
  { id: 'llama-4-maverick', label: 'Llama 4 Maverick', tag: 'Open source' },
  { id: 'llama-4-scout', label: 'Llama 4 Scout', tag: 'Open source • Free tier' },
  { id: 'mistral-large', label: 'Mistral Large', tag: 'Open source' },
];

interface ModelSelectorProps {
  selected: string;
  onChange: (model: string) => void;
}

export function ModelSelector({ selected, onChange }: ModelSelectorProps) {
  return (
    <div className="relative">
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs py-1.5 px-2 rounded appearance-none cursor-pointer outline-none"
        style={{
          backgroundColor: 'var(--vscode-input-background)',
          color: 'var(--vscode-input-foreground)',
          border: '1px solid var(--vscode-input-border, transparent)',
        }}
      >
        {MODELS.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label} — {model.tag}
          </option>
        ))}
      </select>
      <div
        className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-xs opacity-50"
      >
        ▾
      </div>
    </div>
  );
}
