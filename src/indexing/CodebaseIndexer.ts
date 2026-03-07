import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { CodeParser } from './CodeParser';
import {
  CodebaseIndex,
  ParsedFile,
  SymbolLocation,
  TechStack,
  IndexStats
} from '../types/core';

export class CodebaseIndexer {
  private parser: CodeParser;
  private index: CodebaseIndex;
  private indexingInProgress: boolean = false;
  private priorityQueue: Set<string> = new Set();
  private backgroundQueue: Set<string> = new Set();

  constructor() {
    this.parser = new CodeParser();
    this.index = {
      repoMap: '',
      files: new Map(),
      symbols: new Map(),
      techStack: {
        languages: [],
        frameworks: [],
        buildTools: [],
      },
      lastFullIndex: 0,
      stats: {
        totalFiles: 0,
        parsedFiles: 0,
        totalSymbols: 0,
        lastFullIndex: 0,
        indexDuration: 0
      }
    };
  }

  async fullIndex(workspaceRoot: string): Promise<void> {
    if (this.indexingInProgress) {
      console.log('Indexing already in progress');
      return;
    }

    this.indexingInProgress = true;
    const startTime = Date.now();

    try {
      const files = await this.getAllFiles(workspaceRoot);
      this.index.stats.totalFiles = files.length;

      const openEditors = vscode.window.visibleTextEditors.map(e => e.document.uri.fsPath);
      const priorityFiles = files.filter(f => openEditors.includes(f));
      const regularFiles = files.filter(f => !openEditors.includes(f));

      for (const file of priorityFiles) {
        await this.indexFile(file);
      }

      for (const file of regularFiles.slice(0, 50)) {
        await this.indexFile(file);
      }

      this.backgroundQueue = new Set(regularFiles.slice(50));

      this.generateRepoMap();
      this.detectTechStack(workspaceRoot);

      this.index.lastFullIndex = Date.now();
      this.index.stats.lastFullIndex = this.index.lastFullIndex;
      this.index.stats.indexDuration = Date.now() - startTime;

      this.startBackgroundIndexing();
    } finally {
      this.indexingInProgress = false;
    }
  }

  async indexFile(filePath: string): Promise<void> {
    try {
      const parsed = await this.parser.parseFile(filePath);
      if (!parsed) return;

      this.index.files.set(filePath, parsed);
      this.index.stats.parsedFiles++;

      for (const func of parsed.functions) {
        this.addSymbol(func.name, filePath, func.startLine, 'function');
        this.index.stats.totalSymbols++;
      }

      for (const cls of parsed.classes) {
        this.addSymbol(cls.name, filePath, cls.startLine, 'class');
        this.index.stats.totalSymbols++;

        for (const method of cls.methods) {
          this.addSymbol(`${cls.name}.${method.name}`, filePath, method.startLine, 'method');
          this.index.stats.totalSymbols++;
        }

        for (const prop of cls.properties) {
          this.addSymbol(`${cls.name}.${prop.name}`, filePath, prop.line, 'property');
          this.index.stats.totalSymbols++;
        }
      }

      for (const type of parsed.types) {
        this.addSymbol(type.name, filePath, type.line, 'type');
        this.index.stats.totalSymbols++;
      }
    } catch (error) {
      console.error(`Failed to index file ${filePath}:`, error);
    }
  }

  async reindexFile(filePath: string): Promise<void> {
    this.removeFileFromIndex(filePath);
    await this.indexFile(filePath);
    this.generateRepoMap();
  }

  private removeFileFromIndex(filePath: string): void {
    const parsed = this.index.files.get(filePath);
    if (!parsed) return;

    this.index.files.delete(filePath);
    this.index.stats.parsedFiles--;

    const symbolsToRemove: string[] = [];
    for (const [symbolName, locations] of this.index.symbols.entries()) {
      const filtered = locations.filter(loc => loc.file !== filePath);
      if (filtered.length === 0) {
        symbolsToRemove.push(symbolName);
      } else {
        this.index.symbols.set(symbolName, filtered);
      }
    }

    for (const symbolName of symbolsToRemove) {
      this.index.symbols.delete(symbolName);
    }
  }

  private addSymbol(name: string, file: string, line: number, type: SymbolLocation['type']): void {
    const existing = this.index.symbols.get(name) || [];
    existing.push({ file, line, type });
    this.index.symbols.set(name, existing);
  }

  private async getAllFiles(workspaceRoot: string): Promise<string[]> {
    const files: string[] = [];
    const excludePatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/out/**',
      '**/*.min.js',
      '**/.vscode/**',
      '**/coverage/**'
    ];

    const pattern = new vscode.RelativePattern(workspaceRoot, '**/*.{ts,tsx,js,jsx,py,go,rs,java,php,rb,cs}');
    const foundFiles = await vscode.workspace.findFiles(pattern, `{${excludePatterns.join(',')}}`);

    return foundFiles.map(uri => uri.fsPath);
  }

  private generateRepoMap(): void {
    const lines: string[] = [];
    const filesByDir = new Map<string, string[]>();

    for (const [filePath, parsed] of this.index.files.entries()) {
      const dir = path.dirname(filePath);
      const existing = filesByDir.get(dir) || [];
      existing.push(filePath);
      filesByDir.set(dir, existing);
    }

    const sortedDirs = Array.from(filesByDir.keys()).sort();

    for (const dir of sortedDirs) {
      const files = filesByDir.get(dir) || [];
      const relativeDir = path.relative(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', dir);

      lines.push(`\n## ${relativeDir || '.'}/`);

      for (const filePath of files.sort()) {
        const parsed = this.index.files.get(filePath);
        if (!parsed) continue;

        const fileName = path.basename(filePath);
        lines.push(`\n### ${fileName}`);

        if (parsed.classes.length > 0) {
          lines.push('Classes:');
          for (const cls of parsed.classes) {
            lines.push(`  - ${cls.name} (${cls.methods.length} methods)`);
          }
        }

        if (parsed.functions.length > 0) {
          lines.push('Functions:');
          for (const func of parsed.functions.slice(0, 10)) {
            lines.push(`  - ${func.name}()`);
          }
          if (parsed.functions.length > 10) {
            lines.push(`  ... and ${parsed.functions.length - 10} more`);
          }
        }

        if (parsed.types.length > 0) {
          lines.push('Types:');
          for (const type of parsed.types.slice(0, 5)) {
            lines.push(`  - ${type.name} (${type.kind})`);
          }
        }
      }
    }

    this.index.repoMap = lines.join('\n');
  }

  private async detectTechStack(workspaceRoot: string): Promise<void> {
    const languages = new Set<string>();
    const frameworks = new Set<string>();
    const buildTools = new Set<string>();
    let packageManager: string | undefined;
    let runtime: string | undefined;

    for (const parsed of this.index.files.values()) {
      languages.add(parsed.language);
    }

    try {
      const packageJsonPath = path.join(workspaceRoot, 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      if (packageJson.dependencies) {
        const deps = Object.keys(packageJson.dependencies);
        if (deps.includes('react')) frameworks.add('React');
        if (deps.includes('vue')) frameworks.add('Vue');
        if (deps.includes('angular')) frameworks.add('Angular');
        if (deps.includes('express')) frameworks.add('Express');
        if (deps.includes('next')) frameworks.add('Next.js');
        if (deps.includes('nuxt')) frameworks.add('Nuxt.js');
        if (deps.includes('svelte')) frameworks.add('Svelte');
      }

      if (packageJson.devDependencies) {
        const devDeps = Object.keys(packageJson.devDependencies);
        if (devDeps.includes('webpack')) buildTools.add('Webpack');
        if (devDeps.includes('vite')) buildTools.add('Vite');
        if (devDeps.includes('rollup')) buildTools.add('Rollup');
        if (devDeps.includes('esbuild')) buildTools.add('esbuild');
        if (devDeps.includes('typescript')) buildTools.add('TypeScript');
      }

      packageManager = 'npm';
      runtime = 'Node.js';
    } catch (error) {
      // No package.json
    }

    try {
      const requirementsPath = path.join(workspaceRoot, 'requirements.txt');
      await fs.access(requirementsPath);
      packageManager = 'pip';
      runtime = 'Python';
    } catch (error) {
      // No requirements.txt
    }

    try {
      const goModPath = path.join(workspaceRoot, 'go.mod');
      await fs.access(goModPath);
      packageManager = 'go mod';
      runtime = 'Go';
    } catch (error) {
      // No go.mod
    }

    this.index.techStack = {
      languages: Array.from(languages),
      frameworks: Array.from(frameworks),
      buildTools: Array.from(buildTools),
      packageManager,
      runtime
    };
  }

  private async startBackgroundIndexing(): Promise<void> {
    if (this.backgroundQueue.size === 0) return;

    setTimeout(async () => {
      const batch = Array.from(this.backgroundQueue).slice(0, 10);
      this.backgroundQueue = new Set(Array.from(this.backgroundQueue).slice(10));

      for (const file of batch) {
        await this.indexFile(file);
      }

      if (this.backgroundQueue.size > 0) {
        this.startBackgroundIndexing();
      }
    }, 100);
  }

  getIndex(): CodebaseIndex {
    return this.index;
  }

  getRepoMap(): string {
    return this.index.repoMap;
  }

  findSymbol(name: string): SymbolLocation[] {
    return this.index.symbols.get(name) || [];
  }

  searchSymbols(query: string): SymbolLocation[] {
    const results: SymbolLocation[] = [];
    const lowerQuery = query.toLowerCase();

    for (const [symbolName, locations] of this.index.symbols.entries()) {
      if (symbolName.toLowerCase().includes(lowerQuery)) {
        results.push(...locations);
      }
    }

    return results;
  }

  getFileInfo(filePath: string): ParsedFile | undefined {
    return this.index.files.get(filePath);
  }

  getStats(): IndexStats {
    return this.index.stats;
  }

  getTechStack(): TechStack {
    return this.index.techStack;
  }
}
