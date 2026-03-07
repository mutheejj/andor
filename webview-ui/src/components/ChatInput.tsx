import React, { useState, useRef, useCallback, useEffect } from 'react';
import { MentionSearch, FileSearchResult } from './MentionSearch';
import { FileAttachmentBar, AttachedItem } from './FileAttachmentBar';

interface ChatInputProps {
  onSend: (text: string, images: string[], attachedFiles: AttachedItem[]) => void;
  isLoading: boolean;
  onCancel?: () => void;
  postMessage: (msg: unknown) => void;
  fileSearchResults: FileSearchResult[];
}

export function ChatInput({ onSend, isLoading, onCancel, postMessage, fileSearchResults }: ChatInputProps) {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<AttachedItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMention, setShowMention] = useState(false);
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [inputText]);

  // Handle @-mention detection
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputText(value);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([\w./\-]*)$/);

    if (atMatch) {
      const query = atMatch[1];
      setMentionQuery(query);
      setMentionStartIndex(cursorPos - query.length - 1);
      setShowMention(true);
      if (query.length > 0) {
        postMessage({ type: 'searchFiles', query });
      }
    } else {
      setShowMention(false);
      setMentionQuery('');
    }
  }, [postMessage]);

  const handleMentionSelect = useCallback((result: FileSearchResult) => {
    const before = inputText.slice(0, mentionStartIndex);
    const after = inputText.slice(mentionStartIndex + mentionQuery.length + 1);
    const newText = `${before}@${result.relativePath} ${after}`;
    setInputText(newText);
    setShowMention(false);

    // Also attach the file content
    setAttachments(prev => {
      if (prev.some(a => a.path === result.path)) return prev;
      return [...prev, {
        id: crypto.randomUUID(),
        type: 'file' as const,
        name: result.name,
        path: result.path,
        size: 0,
      }];
    });

    // Request file content
    postMessage({ type: 'getFileContent', filePath: result.path });

    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [inputText, mentionStartIndex, mentionQuery, postMessage]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text && attachments.length === 0) return;
    if (isLoading) return;

    const images = attachments.filter(a => a.type === 'image').map(a => a.dataUrl || '').filter(Boolean);
    onSend(text, images, attachments);
    setInputText('');
    setAttachments([]);
  }, [inputText, attachments, isLoading, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showMention) return; // Let MentionSearch handle keys
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend, showMention]);

  // Drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const items: AttachedItem[] = [];
    let processed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isImage = file.type.startsWith('image/');

      const reader = new FileReader();
      reader.onload = () => {
        if (isImage) {
          items.push({
            id: crypto.randomUUID(),
            type: 'image',
            name: file.name,
            dataUrl: reader.result as string,
            size: file.size,
          });
        } else {
          items.push({
            id: crypto.randomUUID(),
            type: 'file',
            name: file.name,
            content: reader.result as string,
            size: file.size,
          });
        }
        processed++;
        if (processed === files.length) {
          setAttachments(prev => [...prev, ...items]);
        }
      };

      if (isImage) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    }
  }, []);

  const handleFileButton = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImageButton = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const items: AttachedItem[] = [];
    let processed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        items.push({
          id: crypto.randomUUID(),
          type: 'file',
          name: file.name,
          content: reader.result as string,
          size: file.size,
        });
        processed++;
        if (processed === files.length) {
          setAttachments(prev => [...prev, ...items]);
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  }, []);

  const handleImageFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const items: AttachedItem[] = [];
    let processed = 0;
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
        processed++;
        if (processed === files.length) {
          setAttachments(prev => [...prev, ...items]);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex-shrink-0"
      style={{ borderTop: '1px solid var(--vscode-panel-border)' }}
    >
      {/* File attachment chips */}
      <FileAttachmentBar
        attachments={attachments}
        onAdd={(items) => setAttachments(prev => [...prev, ...items])}
        onRemove={(id) => setAttachments(prev => prev.filter(a => a.id !== id))}
        onClear={() => setAttachments([])}
      />

      {/* Image previews */}
      {attachments.filter(a => a.type === 'image').length > 0 && (
        <div className="flex gap-2 px-3 py-1 overflow-x-auto">
          {attachments.filter(a => a.type === 'image').map(img => (
            <div key={img.id} className="relative flex-shrink-0 group">
              <img
                src={img.dataUrl}
                alt={img.name}
                className="h-16 rounded border"
                style={{ borderColor: 'var(--vscode-panel-border)' }}
              />
              <button
                onClick={() => setAttachments(prev => prev.filter(a => a.id !== img.id))}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'var(--vscode-errorForeground, #f48771)', color: '#fff' }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* @-mention dropdown */}
      <MentionSearch
        query={mentionQuery}
        results={fileSearchResults}
        visible={showMention}
        onSelect={handleMentionSelect}
        onDismiss={() => setShowMention(false)}
        position={{ top: 8, left: 12 }}
      />

      {/* Input area with drag & drop */}
      <div
        className="flex items-end gap-1 px-2 py-2 transition-colors"
        style={{
          background: isDragOver
            ? 'var(--vscode-editor-selectionBackground, #264f78)'
            : 'transparent',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Attachment buttons */}
        <div className="flex items-center gap-0.5 pb-1">
          <button
            onClick={handleFileButton}
            className="text-[12px] p-1 rounded opacity-40 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--vscode-foreground)' }}
            title="Attach file (or drag & drop)"
          >
            📎
          </button>
          <button
            onClick={handleImageButton}
            className="text-[12px] p-1 rounded opacity-40 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--vscode-foreground)' }}
            title="Attach image (or drag & drop)"
          >
            🖼
          </button>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={isDragOver ? 'Drop files here...' : 'Message Andor... (@ to mention files, drag & drop to attach)'}
          rows={1}
          className="flex-1 resize-none rounded-md px-3 py-2 text-[12px] outline-none"
          style={{
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: `1px solid ${isDragOver ? 'var(--vscode-focusBorder)' : 'var(--vscode-input-border, transparent)'}`,
            maxHeight: '200px',
            minHeight: '36px',
          }}
          disabled={isLoading}
        />

        {/* Send / Cancel button */}
        {isLoading ? (
          <button
            onClick={onCancel}
            className="flex-shrink-0 px-3 py-2 rounded-md text-[11px] font-medium transition-opacity hover:opacity-90"
            style={{
              background: 'var(--vscode-errorForeground, #f48771)',
              color: '#fff',
            }}
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!inputText.trim() && attachments.length === 0}
            className="flex-shrink-0 px-3 py-2 rounded-md text-[11px] font-medium transition-opacity"
            style={{
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
              opacity: !inputText.trim() && attachments.length === 0 ? 0.4 : 1,
            }}
          >
            Send
          </button>
        )}
      </div>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
      <input ref={imageInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleImageFileSelect} />

      {/* Drag overlay hint */}
      {isDragOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
          <div
            className="text-sm font-medium px-4 py-2 rounded-lg"
            style={{
              background: 'var(--vscode-editor-selectionBackground, #264f78)',
              color: 'var(--vscode-foreground)',
              border: '2px dashed var(--vscode-focusBorder)',
            }}
          >
            Drop files, images, or folders here
          </div>
        </div>
      )}
    </div>
  );
}
