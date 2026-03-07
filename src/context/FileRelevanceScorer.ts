import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceIndexer } from '../indexer/WorkspaceIndexer';
import { ImportGraphBuilder } from './ImportGraphBuilder';
import { DiagnosticEntry } from '../types';

export interface RelevanceSignals {
  isCurrentlyOpen:        number; // weight: 10.0
  isActiveEditorFile:     number; // weight: 12.0
  isDirectlyImported:     number; // weight: 8.0
  isImportedTransitively: number; // weight: 4.0
  mentionedInUserMessage: number; // weight: 9.0
  recentlyEdited:         number; // weight: 6.0
  hasActiveDiagnostics:   number; // weight: 7.0
  sameDirectoryAsOpen:    number; // weight: 3.0
  keywordOverlap:         number; // weight: 5.0
  isConfigFile:           number; // weight: 2.0
  isTestFile:             number; // weight: 1.5
  fileSize:               number; // weight: -0.1 per KB
}

export interface ScoredFile {
  path: string;
  relativePath: string;
  score: number;
  signals: Partial<RelevanceSignals>;
  includeStrategy: 'full' | 'summary' | 'symbols-only' | 'skip';
  estimatedTokens: number;
  reason: string;
}

const SIGNAL_WEIGHTS: Record<keyof RelevanceSignals, number> = {
  isActiveEditorFile:     12.0,
  isCurrentlyOpen:        10.0,
  mentionedInUserMessage:  9.0,
  isDirectlyImported:      8.0,
  hasActiveDiagnostics:    7.0,
  recentlyEdited:          6.0,
  keywordOverlap:          5.0,
  isImportedTransitively:  4.0,
  sameDirectoryAsOpen:     3.0,
  isConfigFile:            2.0,
  isTestFile:              1.5,
  fileSize:               -0.1,
};

const CONFIG_FILES = new Set([
  'package.json', 'tsconfig.json', 'vite.config.ts', 'vite.config.js',
  'webpack.config.js', 'webpack.config.ts', 'next.config.js', 'next.config.mjs',
  'tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js',
  '.eslintrc.js', '.eslintrc.json', 'jest.config.ts', 'jest.config.js',
  'vitest.config.ts', 'pyproject.toml', 'Cargo.toml', 'go.mod',
]);

const TEST_PATTERNS = [/\.test\./, /\.spec\./, /__tests__/, /test_/, /_test\./];

// ~4 chars per token on average
const CHARS_PER_TOKEN = 4;

export class FileRelevanceScorer {
  private importGraph: ImportGraphBuilder;
  private indexer: WorkspaceIndexer;

  constructor(indexer: WorkspaceIndexer, importGraph: ImportGraphBuilder) {
    this.indexer = indexer;
    this.importGraph = importGraph;
  }

  /**
   * Score all workspace files by relevance to the current task.
   * Returns sorted list of scored files, highest relevance first.
   */
  scoreFiles(
    userMessage: string,
    diagnostics: DiagnosticEntry[],
    maxContextTokens: number = 60000,
  ): ScoredFile[] {
    const index = this.indexer.getIndex();
    const workspaceRoot = this.indexer.getWorkspaceRoot();
    if (!workspaceRoot) return [];

    // Collect signals
    const activeEditor = vscode.window.activeTextEditor;
    const activeFilePath = activeEditor?.document.uri.fsPath;
    const openEditors = new Set(
      vscode.window.visibleTextEditors.map(e => e.document.uri.fsPath)
    );
    const activeDir = activeFilePath ? path.dirname(activeFilePath) : null;

    // Build direct + transitive import sets from active file
    const directImports = activeFilePath
      ? new Set(this.importGraph.getImportsOf(activeFilePath))
      : new Set<string>();
    const transitiveImports = activeFilePath
      ? this.importGraph.getTransitiveImports(activeFilePath, 2)
      : new Set<string>();
    // Remove direct imports from transitive set (don't double-count)
    for (const d of directImports) transitiveImports.delete(d);

    // Diagnostics file set
    const diagFiles = new Map<string, number>();
    for (const diag of diagnostics) {
      const fullPath = path.isAbsolute(diag.file)
        ? diag.file
        : path.join(workspaceRoot, diag.file);
      const count = diagFiles.get(fullPath) ?? 0;
      diagFiles.set(fullPath, count + (diag.severity === 'error' ? 2 : 1));
    }

    // Extract keywords from user message
    const keywords = this.extractKeywords(userMessage);
    const messageLower = userMessage.toLowerCase();

    // Recently edited files (from index)
    const recentSet = new Set(index.recentFiles.slice(0, 15));

    // Score every file
    const scored: ScoredFile[] = [];

    for (const [filePath, fileInfo] of index.files) {
      const signals: Partial<RelevanceSignals> = {};
      const fileName = path.basename(filePath);
      const fileNameNoExt = path.basename(filePath, path.extname(filePath));
      const relPath = fileInfo.relativePath;

      // Active editor file
      if (filePath === activeFilePath) {
        signals.isActiveEditorFile = 1;
      }

      // Currently open
      if (openEditors.has(filePath)) {
        signals.isCurrentlyOpen = 1;
      }

      // Mentioned in user message
      if (messageLower.includes(relPath.toLowerCase()) ||
          messageLower.includes(fileName.toLowerCase()) ||
          messageLower.includes(fileNameNoExt.toLowerCase())) {
        signals.mentionedInUserMessage = 1;
      }

      // Direct import of active file
      if (directImports.has(filePath)) {
        signals.isDirectlyImported = 1;
      }

      // Transitive import
      if (transitiveImports.has(filePath)) {
        signals.isImportedTransitively = 1;
      }

      // Recently edited
      if (recentSet.has(filePath)) {
        signals.recentlyEdited = 1;
      }

      // Has diagnostics
      const diagCount = diagFiles.get(filePath);
      if (diagCount) {
        signals.hasActiveDiagnostics = Math.min(diagCount, 5) / 5; // normalize 0-1
      }

      // Same directory as active file
      if (activeDir && path.dirname(filePath) === activeDir && filePath !== activeFilePath) {
        signals.sameDirectoryAsOpen = 1;
      }

      // Keyword overlap
      let keywordHits = 0;
      for (const kw of keywords) {
        if (relPath.toLowerCase().includes(kw)) keywordHits++;
        // Check symbol names
        const symbols = index.symbols.get(filePath);
        if (symbols) {
          for (const sym of symbols) {
            if (sym.name.toLowerCase().includes(kw)) {
              keywordHits++;
              break;
            }
          }
        }
      }
      if (keywordHits > 0 && keywords.length > 0) {
        signals.keywordOverlap = Math.min(keywordHits / keywords.length, 1);
      }

      // Config file
      if (CONFIG_FILES.has(fileName)) {
        signals.isConfigFile = 1;
      }

      // Test file
      if (TEST_PATTERNS.some(p => p.test(relPath))) {
        signals.isTestFile = 1;
      }

      // File size penalty (per KB)
      signals.fileSize = fileInfo.size / 1024;

      // Calculate total score
      let totalScore = 0;
      for (const [key, value] of Object.entries(signals)) {
        const weight = SIGNAL_WEIGHTS[key as keyof RelevanceSignals] ?? 0;
        totalScore += (value as number) * weight;
      }

      // Determine include strategy based on file size
      const estimatedTokens = Math.ceil(fileInfo.size / CHARS_PER_TOKEN);
      let includeStrategy: ScoredFile['includeStrategy'] = 'full';
      if (estimatedTokens > 8000) {
        includeStrategy = 'summary';
      } else if (estimatedTokens > 4000) {
        includeStrategy = totalScore > 15 ? 'full' : 'symbols-only';
      }

      // Build human-readable reason
      const reasons: string[] = [];
      if (signals.isActiveEditorFile) reasons.push('active editor');
      if (signals.isCurrentlyOpen) reasons.push('open in editor');
      if (signals.mentionedInUserMessage) reasons.push('mentioned in message');
      if (signals.isDirectlyImported) reasons.push('imported by active file');
      if (signals.isImportedTransitively) reasons.push('transitive import');
      if (signals.recentlyEdited) reasons.push('recently edited');
      if (signals.hasActiveDiagnostics) reasons.push('has diagnostics');
      if (signals.sameDirectoryAsOpen) reasons.push('same directory');
      if (signals.keywordOverlap) reasons.push('keyword match');
      if (signals.isConfigFile) reasons.push('config file');

      scored.push({
        path: filePath,
        relativePath: relPath,
        score: totalScore,
        signals,
        includeStrategy,
        estimatedTokens,
        reason: reasons.join(' + ') || 'workspace file',
      });
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Fill context budget greedily (70% of max to leave room for response)
    const tokenBudget = Math.floor(maxContextTokens * 0.7);
    let usedTokens = 0;

    for (const file of scored) {
      if (file.score <= 0) {
        file.includeStrategy = 'skip';
        continue;
      }

      const tokensForFile = file.includeStrategy === 'summary'
        ? Math.min(file.estimatedTokens, 500)
        : file.includeStrategy === 'symbols-only'
          ? Math.min(file.estimatedTokens, 200)
          : file.estimatedTokens;

      if (usedTokens + tokensForFile > tokenBudget) {
        // Try downgrading strategy
        if (file.includeStrategy === 'full' && usedTokens + 500 <= tokenBudget) {
          file.includeStrategy = 'summary';
          usedTokens += 500;
        } else if (usedTokens + 200 <= tokenBudget) {
          file.includeStrategy = 'symbols-only';
          usedTokens += 200;
        } else {
          file.includeStrategy = 'skip';
        }
      } else {
        usedTokens += tokensForFile;
      }
    }

    return scored;
  }

  /** Get only the files that should be included in context */
  getIncludedFiles(scored: ScoredFile[]): ScoredFile[] {
    return scored.filter(f => f.includeStrategy !== 'skip');
  }

  /**
   * Read file content according to its include strategy:
   * - full: entire file content
   * - summary: first 50 lines + exported symbols list
   * - symbols-only: just the list of exported symbols
   */
  readFileContent(file: ScoredFile): string {
    try {
      if (file.includeStrategy === 'skip') return '';

      const content = fs.readFileSync(file.path, 'utf-8');

      if (file.includeStrategy === 'full') {
        return content;
      }

      if (file.includeStrategy === 'summary') {
        const lines = content.split('\n');
        const head = lines.slice(0, 50).join('\n');
        const symbols = this.indexer.getIndex().symbols.get(file.path) ?? [];
        const symList = symbols.map(s => `  ${s.kind} ${s.name} (line ${s.line})`).join('\n');
        return `${head}\n\n... (${lines.length} total lines, truncated)\n\nExported symbols:\n${symList}`;
      }

      // symbols-only
      const symbols = this.indexer.getIndex().symbols.get(file.path) ?? [];
      return `// ${file.relativePath} — symbols only\n` +
        symbols.map(s => `${s.kind} ${s.name} (line ${s.line})`).join('\n');
    } catch {
      return '';
    }
  }

  private extractKeywords(message: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'this', 'that', 'it', 'its', 'my',
      'your', 'how', 'what', 'why', 'when', 'where', 'which', 'and', 'or',
      'not', 'no', 'but', 'if', 'then', 'so', 'up', 'out', 'about', 'into',
      'i', 'me', 'we', 'you', 'all', 'just', 'also', 'than', 'too', 'very',
      'only', 'make', 'add', 'fix', 'change', 'update', 'create', 'delete',
      'remove', 'get', 'set', 'use', 'need', 'want', 'please', 'help',
      'code', 'file',
    ]);

    return message
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
  }
}
