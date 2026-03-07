import React, { useState, useRef, useCallback } from 'react';

export interface AttachedItem {
  id: string;
  type: 'file' | 'folder' | 'image';
  name: string;
  path?: string;
  content?: string;
  dataUrl?: string; // for images
  size?: number;
}

interface FileAttachmentBarProps {
  attachments: AttachedItem[];
  onAdd: (items: AttachedItem[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function FileAttachmentBar({ attachments, onAdd, onRemove, onClear }: FileAttachmentBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const items: AttachedItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        items.push({
          id: crypto.randomUUID(),
          type: 'file',
          name: file.name,
          content,
          size: file.size,
        });
        if (items.length === files.length) {
          onAdd(items);
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  }, [onAdd]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const items: AttachedItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        items.push({
          id: crypto.randomUUID(),
          type: 'image',
          name: file.name,
          dataUrl: reader.result as string,
          size: file.size,
        });
        if (items.length === files.length) {
          onAdd(items);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }, [onAdd]);

  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-1.5 animate-fade-in" style={{ borderTop: '1px solid var(--vscode-panel-border)' }}>
      {attachments.map(item => (
        <div
          key={item.id}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] max-w-[200px] group"
          style={{ background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}
          title={item.path || item.name}
        >
          <span className="opacity-60">
            {item.type === 'image' ? '🖼' : item.type === 'folder' ? '📁' : '📄'}
          </span>
          <span className="truncate">{item.name}</span>
          {item.size && (
            <span className="opacity-40 flex-shrink-0">
              {item.size > 1024 ? `${(item.size / 1024).toFixed(0)}K` : `${item.size}B`}
            </span>
          )}
          <button
            onClick={() => onRemove(item.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] ml-0.5 hover:text-red-400"
            title="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      {attachments.length > 1 && (
        <button
          onClick={onClear}
          className="text-[9px] opacity-40 hover:opacity-100 px-1 transition-opacity"
          title="Clear all"
        >
          Clear all
        </button>
      )}
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
      <input ref={imageInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleImageSelect} />
    </div>
  );
}

interface AttachmentButtonsProps {
  onAttachFile: () => void;
  onAttachImage: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
}

export function AttachmentButtons({ onAttachFile, onAttachImage }: AttachmentButtonsProps) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={onAttachFile}
        className="text-[11px] p-1 rounded opacity-50 hover:opacity-100 transition-opacity"
        style={{ color: 'var(--vscode-foreground)' }}
        title="Attach file"
      >
        📎
      </button>
      <button
        onClick={onAttachImage}
        className="text-[11px] p-1 rounded opacity-50 hover:opacity-100 transition-opacity"
        style={{ color: 'var(--vscode-foreground)' }}
        title="Attach image"
      >
        🖼
      </button>
    </div>
  );
}
