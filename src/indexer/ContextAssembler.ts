import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceIndexer } from './WorkspaceIndexer';
import { ContextFile, DiagnosticEntry } from '../types';

const MAX_CONTEXT_FILES = 8;
const MAX_FILE_SIZE = 4_000;

export class ContextAssembler {
  private indexer: WorkspaceIndexer;

  constructor(indexer: WorkspaceIndexer) {
    this.indexer = indexer;
  }

  assembleContext(userMessage: string, diagnostics: DiagnosticEntry[]): ContextFile[] {
    const index = this.indexer.getIndex();
    const workspaceRoot = this.indexer.getWorkspaceRoot();
    if (!workspaceRoot) {
      return [];
    }

    const scored = new Map<string, { score: number; reason: string }>();

    // 1. Score files mentioned in the message
    for (const [filePath, fileInfo] of index.files) {
      const relativePath = fileInfo.relativePath;
      const fileName = path.basename(filePath);
      const fileNameNoExt = path.basename(filePath, path.extname(filePath));

      if (userMessage.includes(relativePath) || userMessage.includes(fileName)) {
        this.addScore(scored, filePath, 100, 'Mentioned in message');
      }

      // Check if any symbol in this file is mentioned
      const symbols = index.symbols.get(filePath);
      if (symbols) {
        for (const sym of symbols) {
          if (userMessage.includes(sym.name) && sym.name.length > 2) {
            this.addScore(scored, filePath, 60, `Contains symbol "${sym.name}"`);
            break;
          }
        }
      }
    }

    // 2. Score active editor file
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const activeFilePath = activeEditor.document.uri.fsPath;
      if (index.files.has(activeFilePath)) {
        this.addScore(scored, activeFilePath, 80, 'Currently open file');

        // Also score files imported by the active file
        const imports = index.imports.get(activeFilePath);
        if (imports) {
          for (const imp of imports) {
            const resolvedPath = this.resolveImportPath(imp.source, activeFilePath, workspaceRoot);
            if (resolvedPath && index.files.has(resolvedPath)) {
              this.addScore(scored, resolvedPath, 30, `Imported by active file`);
            }
          }
        }
      }
    }

    // 3. Score recently modified files
    for (let i = 0; i < index.recentFiles.length; i++) {
      const filePath = index.recentFiles[i];
      const recencyScore = Math.max(5, 40 - i * 5);
      this.addScore(scored, filePath, recencyScore, 'Recently modified');
    }

    // 4. Score files with diagnostics
    for (const diag of diagnostics) {
      const fullPath = path.isAbsolute(diag.file) ? diag.file : path.join(workspaceRoot, diag.file);
      if (index.files.has(fullPath)) {
        const diagScore = diag.severity === 'error' ? 50 : 20;
        this.addScore(scored, fullPath, diagScore, `Has ${diag.severity}: ${diag.message}`);
      }
    }

    // 5. Score files that match keywords in message
    const keywords = this.extractKeywords(userMessage);
    for (const [filePath, fileInfo] of index.files) {
      for (const keyword of keywords) {
        if (fileInfo.relativePath.toLowerCase().includes(keyword.toLowerCase())) {
          this.addScore(scored, filePath, 25, `Path matches keyword "${keyword}"`);
        }
      }
    }

    // Sort by score and pick top files
    const sortedFiles = Array.from(scored.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, MAX_CONTEXT_FILES);

    const contextFiles: ContextFile[] = [];
    for (const [filePath, { reason }] of sortedFiles) {
      try {
        const fileInfo = index.files.get(filePath);
        if (!fileInfo) { continue; }

        let content = fs.readFileSync(filePath, 'utf-8');
        if (content.length > MAX_FILE_SIZE) {
          content = content.substring(0, MAX_FILE_SIZE) + '\n... (truncated)';
        }

        contextFiles.push({
          path: filePath,
          relativePath: fileInfo.relativePath,
          content,
          reason,
        });
      } catch {
        // File may have been deleted
      }
    }

    return contextFiles;
  }

  buildSystemPrompt(contextFiles: ContextFile[], diagnostics: DiagnosticEntry[]): string {
    const workspaceRoot = this.indexer.getWorkspaceRoot() || 'unknown';
    const index = this.indexer.getIndex();
    const allFiles = Array.from(index.files.values()).map(f => f.relativePath).slice(0, 80);

    let prompt = `You are Andor, an advanced AI coding agent embedded in VS Code. You have full access to the user's codebase and can read, write, debug, refactor, and reason about any code.

IDENTITY: Andor — intelligent, precise, proactive. You think like a senior engineer: understand the full context before acting, reason step-by-step for complex tasks, and always deliver working solutions.

WORKSPACE: ${workspaceRoot}

## CORE CAPABILITIES

### 1. FILE OPERATIONS
Write or overwrite files completely:
\`\`\`write:path/to/file
full file content here
\`\`\`

### 2. TERMINAL / COMMANDS
Run shell commands (installs, builds, tests, git, etc.):
\`\`\`run
npm install && npm run build
\`\`\`

### 3. CODE CHANGES
When showing code for a specific file, always annotate with the path:
\`\`\`typescript:src/components/MyComponent.tsx
// full updated file
\`\`\`

## AGENT BEHAVIOR FOR COMPLEX TASKS

For multi-step tasks, think and plan first, then execute:
1. **Analyze** — understand what exists, what needs changing
2. **Plan** — outline the steps clearly  
3. **Execute** — write/run each step in sequence
4. **Verify** — check for errors, run tests if available
5. **Report** — summarize what was done, flag anything incomplete

When a task is too large for one response:
- Complete as much as possible
- Clearly state: "**Continuing in next step...**" at the end
- The user can click "Continue" to proceed

When a task is COMPLETE:
- Summarize all changes made
- List files modified/created
- Mention any follow-up actions needed
- End with: "**Task complete.**"

## ADVANCED SKILLS

- **Read & understand** large codebases from file listings and context
- **Debug** by tracing error messages, stack traces, and diagnostics
- **Refactor** safely by understanding dependencies and imports
- **Explain** code clearly at any level of detail
- **Generate tests** for functions and components
- **Review** code for bugs, security issues, performance
- **Scaffold** new features following existing patterns in the codebase
- **Run commands** to install deps, build, test, lint, format

## RULES
- ALWAYS use write: blocks to actually create/modify files (never just show code without applying it)
- For destructive changes, explain what will be overwritten
- Keep responses focused — no unnecessary padding
- If you need to read a file not in context, say: "I need to see [filename] — please mention it so I can include it"
- Never hallucinate file contents — only work with what's provided in context
`;

    if (allFiles.length > 0) {
      prompt += `\n## WORKSPACE FILES (${allFiles.length} indexed)\n`;
      prompt += allFiles.join(', ') + '\n';
    }

    if (contextFiles.length > 0) {
      prompt += `\n## RELEVANT FILE CONTENTS\n`;
      for (const file of contextFiles) {
        prompt += `\n### ${file.relativePath}\n> ${file.reason}\n`;
        prompt += `\`\`\`${this.getLanguageId(file.relativePath)}\n${file.content}\n\`\`\`\n`;
      }
    }

    if (diagnostics.length > 0) {
      prompt += `\n## CURRENT DIAGNOSTICS (errors/warnings)\n`;
      for (const diag of diagnostics.slice(0, 10)) {
        prompt += `[${diag.severity.toUpperCase()}] ${diag.file}:${diag.line}:${diag.column} — ${diag.message}${diag.source ? ` (${diag.source})` : ''}\n`;
      }
      prompt += '\n';
    }

    return prompt;
  }

  private addScore(map: Map<string, { score: number; reason: string }>, filePath: string, score: number, reason: string): void {
    const existing = map.get(filePath);
    if (existing) {
      if (score > existing.score) {
        map.set(filePath, { score: existing.score + score, reason });
      } else {
        map.set(filePath, { score: existing.score + score, reason: existing.reason });
      }
    } else {
      map.set(filePath, { score, reason });
    }
  }

  private extractKeywords(message: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at',
      'by', 'from', 'this', 'that', 'these', 'those', 'it', 'its', 'my', 'your',
      'how', 'what', 'why', 'when', 'where', 'which', 'who', 'whom', 'and', 'or',
      'not', 'no', 'but', 'if', 'then', 'else', 'so', 'up', 'out', 'about', 'into',
      'i', 'me', 'we', 'you', 'he', 'she', 'they', 'them', 'all', 'each', 'every',
      'both', 'few', 'more', 'most', 'some', 'any', 'just', 'also', 'than', 'too',
      'very', 'only', 'own', 'same', 'other', 'such', 'make', 'add', 'fix', 'change',
      'update', 'create', 'delete', 'remove', 'get', 'set', 'use', 'need', 'want',
      'please', 'help', 'code', 'file']);

    return message
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
  }

  private resolveImportPath(importSource: string, fromFile: string, workspaceRoot: string): string | null {
    if (!importSource.startsWith('.')) {
      return null;
    }

    const dir = path.dirname(fromFile);
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

    for (const ext of extensions) {
      const candidate = path.resolve(dir, importSource + ext);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    for (const ext of extensions) {
      const candidate = path.resolve(dir, importSource, 'index' + ext);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private getLanguageId(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
      '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java',
      '.c': 'c', '.cpp': 'cpp', '.css': 'css', '.scss': 'scss',
      '.html': 'html', '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
      '.md': 'markdown', '.vue': 'vue', '.svelte': 'svelte',
    };
    return map[ext] || 'plaintext';
  }
}
