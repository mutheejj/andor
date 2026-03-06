import React from 'react';

interface DiffViewerProps {
  filePath: string;
  originalContent: string;
  newContent: string;
  onApply: () => void;
  onCancel: () => void;
}

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
  lineNum: number | null;
  newLineNum: number | null;
}

function computeDiff(original: string, modified: string): DiffLine[] {
  const origLines = original.split('\n');
  const newLines = modified.split('\n');
  const result: DiffLine[] = [];

  const maxLen = Math.max(origLines.length, newLines.length);
  let origIdx = 0;
  let newIdx = 0;

  // Simple line-by-line diff (LCS-based would be better but this is practical)
  while (origIdx < origLines.length || newIdx < newLines.length) {
    if (origIdx >= origLines.length) {
      // Remaining new lines are additions
      result.push({
        type: 'added',
        content: newLines[newIdx],
        lineNum: null,
        newLineNum: newIdx + 1,
      });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      // Remaining old lines are removals
      result.push({
        type: 'removed',
        content: origLines[origIdx],
        lineNum: origIdx + 1,
        newLineNum: null,
      });
      origIdx++;
    } else if (origLines[origIdx] === newLines[newIdx]) {
      result.push({
        type: 'unchanged',
        content: origLines[origIdx],
        lineNum: origIdx + 1,
        newLineNum: newIdx + 1,
      });
      origIdx++;
      newIdx++;
    } else {
      // Look ahead to find if current original line appears later in new
      let foundInNew = -1;
      let foundInOrig = -1;

      for (let j = newIdx + 1; j < Math.min(newIdx + 10, newLines.length); j++) {
        if (origLines[origIdx] === newLines[j]) {
          foundInNew = j;
          break;
        }
      }

      for (let j = origIdx + 1; j < Math.min(origIdx + 10, origLines.length); j++) {
        if (origLines[j] === newLines[newIdx]) {
          foundInOrig = j;
          break;
        }
      }

      if (foundInNew >= 0 && (foundInOrig < 0 || foundInNew - newIdx <= foundInOrig - origIdx)) {
        // Lines added before current original line
        while (newIdx < foundInNew) {
          result.push({
            type: 'added',
            content: newLines[newIdx],
            lineNum: null,
            newLineNum: newIdx + 1,
          });
          newIdx++;
        }
      } else if (foundInOrig >= 0) {
        // Lines removed before current new line
        while (origIdx < foundInOrig) {
          result.push({
            type: 'removed',
            content: origLines[origIdx],
            lineNum: origIdx + 1,
            newLineNum: null,
          });
          origIdx++;
        }
      } else {
        // Replace: old line removed, new line added
        result.push({
          type: 'removed',
          content: origLines[origIdx],
          lineNum: origIdx + 1,
          newLineNum: null,
        });
        result.push({
          type: 'added',
          content: newLines[newIdx],
          lineNum: null,
          newLineNum: newIdx + 1,
        });
        origIdx++;
        newIdx++;
      }
    }

    if (result.length > 2000) break; // Safety limit
  }

  return result;
}

export function DiffViewer({ filePath, originalContent, newContent, onApply, onCancel }: DiffViewerProps) {
  const diffLines = computeDiff(originalContent, newContent);
  const isNewFile = !originalContent;

  return (
    <div className="my-2 rounded overflow-hidden animate-fade-in" style={{ border: '1px solid var(--vscode-panel-border)' }}>
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: 'var(--vscode-editor-background)' }}
      >
        <div className="text-xs">
          <span className="opacity-70">Diff: </span>
          <span className="opacity-90">{filePath}</span>
          {isNewFile && <span className="ml-2 text-[10px] opacity-50">(new file)</span>}
        </div>
        <div className="flex gap-1">
          <button
            onClick={onCancel}
            className="px-2 py-0.5 rounded text-[10px] opacity-70 hover:opacity-100 transition-opacity"
            style={{ background: 'var(--vscode-input-background)' }}
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
            style={{
              backgroundColor: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
            }}
          >
            Apply Changes
          </button>
        </div>
      </div>

      <div
        className="overflow-x-auto max-h-[400px] overflow-y-auto"
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          fontFamily: 'var(--vscode-editor-font-family)',
          fontSize: '11px',
        }}
      >
        {diffLines.map((line, i) => (
          <div
            key={i}
            className="flex"
            style={{
              backgroundColor:
                line.type === 'added'
                  ? 'rgba(40, 160, 40, 0.15)'
                  : line.type === 'removed'
                  ? 'rgba(220, 50, 50, 0.15)'
                  : 'transparent',
            }}
          >
            <span
              className="inline-block w-10 text-right pr-2 select-none flex-shrink-0 opacity-40"
              style={{ borderRight: '1px solid var(--vscode-panel-border)' }}
            >
              {line.lineNum ?? ''}
            </span>
            <span
              className="inline-block w-10 text-right pr-2 select-none flex-shrink-0 opacity-40"
              style={{ borderRight: '1px solid var(--vscode-panel-border)' }}
            >
              {line.newLineNum ?? ''}
            </span>
            <span className="inline-block w-4 text-center select-none flex-shrink-0" style={{
              color: line.type === 'added' ? '#4ec94e' : line.type === 'removed' ? '#f44' : 'transparent',
            }}>
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span className="px-2 whitespace-pre">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
