import * as vscode from 'vscode';
import * as path from 'path';
import { CodebaseIndexer } from '../indexing/CodebaseIndexer';
import {
  AssembledContext,
  IncludedFile,
  DiagnosticContext,
  RecentChange,
  ParsedFile
} from '../types/core';

interface FileRelevanceScore {
  path: string;
  score: number;
  reasons: string[];
}

export class ContextAssembler {
  private indexer: CodebaseIndexer;
  private recentChanges: Map<string, RecentChange> = new Map();
  private maxTokens: number = 100000;

  constructor(indexer: CodebaseIndexer) {
    this.indexer = indexer;
  }

  async assembleContext(
    userMessage: string,
    diagnostics: DiagnosticContext[]
  ): Promise<AssembledContext> {
    const startTime = Date.now();

    const openFiles = this.getOpenFiles();
    const mentionedFiles = this.extractMentionedFiles(userMessage);
    const diagnosticFiles = diagnostics.map(d => d.file);
    const recentlyChangedFiles = this.getRecentlyChangedFiles();

    const allCandidates = new Set([
      ...openFiles,
      ...mentionedFiles,
      ...diagnosticFiles,
      ...recentlyChangedFiles
    ]);

    const scoredFiles = await this.scoreFiles(
      Array.from(allCandidates),
      userMessage,
      openFiles,
      mentionedFiles,
      diagnosticFiles,
      recentlyChangedFiles
    );

    scoredFiles.sort((a, b) => b.score - a.score);

    const repoMap = this.indexer.getRepoMap();
    const repoMapTokens = this.estimateTokens(repoMap);
    const diagnosticsTokens = this.estimateTokens(JSON.stringify(diagnostics));
    const recentChangesTokens = this.estimateTokens(JSON.stringify(Array.from(this.recentChanges.values())));

    let remainingTokens = this.maxTokens - repoMapTokens - diagnosticsTokens - recentChangesTokens - 1000;

    const includedFiles: IncludedFile[] = [];
    const droppedFiles: string[] = [];

    for (const scored of scoredFiles) {
      const fileContent = await this.readFile(scored.path);
      if (!fileContent) {
        droppedFiles.push(scored.path);
        continue;
      }

      const fileTokens = this.estimateTokens(fileContent);

      if (fileTokens <= remainingTokens) {
        includedFiles.push({
          path: scored.path,
          content: fileContent,
          reason: scored.reasons.join(', '),
          relevanceScore: scored.score,
          tokens: fileTokens,
          truncated: false
        });
        remainingTokens -= fileTokens;
      } else if (remainingTokens > 500) {
        const truncatedContent = this.truncateFile(fileContent, remainingTokens);
        const truncatedTokens = this.estimateTokens(truncatedContent);
        includedFiles.push({
          path: scored.path,
          content: truncatedContent,
          reason: scored.reasons.join(', '),
          relevanceScore: scored.score,
          tokens: truncatedTokens,
          truncated: true
        });
        remainingTokens -= truncatedTokens;
      } else {
        droppedFiles.push(scored.path);
      }
    }

    const totalTokens = this.maxTokens - remainingTokens;

    console.log(`Context assembled in ${Date.now() - startTime}ms: ${includedFiles.length} files, ${totalTokens} tokens`);

    return {
      repoMap,
      includedFiles,
      diagnostics,
      recentChanges: Array.from(this.recentChanges.values()),
      totalTokens,
      droppedFiles
    };
  }

  private async scoreFiles(
    files: string[],
    userMessage: string,
    openFiles: string[],
    mentionedFiles: string[],
    diagnosticFiles: string[],
    recentlyChangedFiles: string[]
  ): Promise<FileRelevanceScore[]> {
    const scored: FileRelevanceScore[] = [];
    const messageLower = userMessage.toLowerCase();
    const keywords = this.extractKeywords(messageLower);

    for (const filePath of files) {
      let score = 0;
      const reasons: string[] = [];

      if (openFiles.includes(filePath)) {
        score += 100;
        reasons.push('currently open');
      }

      if (mentionedFiles.includes(filePath)) {
        score += 90;
        reasons.push('mentioned by name');
      }

      if (diagnosticFiles.includes(filePath)) {
        score += 80;
        reasons.push('has diagnostics');
      }

      if (recentlyChangedFiles.includes(filePath)) {
        score += 70;
        reasons.push('recently modified');
      }

      const relatedFiles = await this.findRelatedFiles(filePath);
      for (const relatedFile of relatedFiles) {
        if (openFiles.includes(relatedFile)) {
          score += 50;
          reasons.push('imports/imported by open file');
          break;
        }
      }

      const fileName = path.basename(filePath).toLowerCase();
      for (const keyword of keywords) {
        if (fileName.includes(keyword)) {
          score += 30;
          reasons.push(`matches keyword: ${keyword}`);
        }
      }

      const fileInfo = this.indexer.getFileInfo(filePath);
      if (fileInfo) {
        for (const keyword of keywords) {
          for (const func of fileInfo.functions) {
            if (func.name.toLowerCase().includes(keyword)) {
              score += 20;
              reasons.push(`function matches: ${func.name}`);
            }
          }
          for (const cls of fileInfo.classes) {
            if (cls.name.toLowerCase().includes(keyword)) {
              score += 20;
              reasons.push(`class matches: ${cls.name}`);
            }
          }
        }
      }

      const openDir = openFiles.length > 0 ? path.dirname(openFiles[0]) : '';
      if (openDir && path.dirname(filePath) === openDir) {
        score += 40;
        reasons.push('same directory as open file');
      }

      if (score > 0) {
        scored.push({ path: filePath, score, reasons });
      }
    }

    return scored;
  }

  private async findRelatedFiles(filePath: string): Promise<string[]> {
    const related: string[] = [];
    const fileInfo = this.indexer.getFileInfo(filePath);
    if (!fileInfo) return related;

    for (const imp of fileInfo.imports) {
      const resolvedPath = this.resolveImportPath(filePath, imp.from);
      if (resolvedPath) {
        related.push(resolvedPath);
      }
    }

    const index = this.indexer.getIndex();
    for (const [otherPath, otherInfo] of index.files.entries()) {
      if (otherPath === filePath) continue;

      for (const imp of otherInfo.imports) {
        const resolvedPath = this.resolveImportPath(otherPath, imp.from);
        if (resolvedPath === filePath) {
          related.push(otherPath);
        }
      }
    }

    return related;
  }

  private resolveImportPath(fromFile: string, importPath: string): string | null {
    if (importPath.startsWith('.')) {
      const dir = path.dirname(fromFile);
      const resolved = path.resolve(dir, importPath);
      
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py'];
      for (const ext of extensions) {
        const withExt = resolved + ext;
        if (this.indexer.getFileInfo(withExt)) {
          return withExt;
        }
      }
      
      const indexFile = path.join(resolved, 'index.ts');
      if (this.indexer.getFileInfo(indexFile)) {
        return indexFile;
      }
    }
    return null;
  }

  private extractKeywords(message: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they']);
    
    const words = message
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    return Array.from(new Set(words));
  }

  private extractMentionedFiles(message: string): string[] {
    const files: string[] = [];
    const filePattern = /(?:^|\s)([a-zA-Z0-9_\-\/\.]+\.[a-zA-Z]{2,4})(?:\s|$)/g;
    let match;

    while ((match = filePattern.exec(message)) !== null) {
      const fileName = match[1];
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        const fullPath = path.join(workspaceRoot, fileName);
        files.push(fullPath);
      }
    }

    return files;
  }

  private getOpenFiles(): string[] {
    return vscode.window.visibleTextEditors.map(editor => editor.document.uri.fsPath);
  }

  private getRecentlyChangedFiles(): string[] {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    return Array.from(this.recentChanges.values())
      .filter(change => change.timestamp > tenMinutesAgo)
      .map(change => change.file);
  }

  private async readFile(filePath: string): Promise<string | null> {
    try {
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      return document.getText();
    } catch (error) {
      console.error(`Failed to read file ${filePath}:`, error);
      return null;
    }
  }

  private truncateFile(content: string, maxTokens: number): string {
    const lines = content.split('\n');
    const maxLines = Math.floor(maxTokens / 4);
    
    if (lines.length <= maxLines) {
      return content;
    }

    const headerLines = Math.floor(maxLines * 0.3);
    const footerLines = Math.floor(maxLines * 0.3);
    const middleLines = maxLines - headerLines - footerLines;

    const header = lines.slice(0, headerLines).join('\n');
    const footer = lines.slice(-footerLines).join('\n');
    const middle = lines.slice(headerLines, headerLines + middleLines).join('\n');

    return `${header}\n\n... [truncated ${lines.length - maxLines} lines] ...\n\n${middle}\n\n... [truncated] ...\n\n${footer}`;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  trackFileChange(file: string, changeType: 'create' | 'modify' | 'delete'): void {
    this.recentChanges.set(file, {
      file,
      timestamp: Date.now(),
      changeType
    });

    setTimeout(() => {
      this.recentChanges.delete(file);
    }, 30 * 60 * 1000);
  }

  setMaxTokens(maxTokens: number): void {
    this.maxTokens = maxTokens;
  }

  clearRecentChanges(): void {
    this.recentChanges.clear();
  }
}
