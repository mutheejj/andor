import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileInfo, SymbolInfo, ImportInfo, WorkspaceIndex } from '../types';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', '.next',
  '.nuxt', 'coverage', '.cache', '__pycache__', '.vscode-test',
  'vendor', '.turbo', '.output', '.svelte-kit', '.parcel-cache', '.pnpm-store',
  '.yarn', '.idea', '.husky', 'tmp', 'temp', 'logs', '.pytest_cache', '.mypy_cache',
]);

const IGNORED_FILE_NAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  '.DS_Store',
  'Thumbs.db',
]);

const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
  '.css', '.scss', '.less', '.html', '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml', '.md',
]);

function getLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescriptreact',
    '.js': 'javascript', '.jsx': 'javascriptreact',
    '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python', '.go': 'go', '.rs': 'rust',
    '.java': 'java', '.c': 'c', '.cpp': 'cpp',
    '.h': 'c', '.hpp': 'cpp',
    '.css': 'css', '.scss': 'scss', '.less': 'less',
    '.html': 'html', '.vue': 'vue', '.svelte': 'svelte',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
    '.toml': 'toml', '.md': 'markdown',
  };
  return map[ext] || 'plaintext';
}

export class WorkspaceIndexer {
  private index: WorkspaceIndex;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private workspaceRoot: string;

  constructor() {
    this.index = {
      files: new Map(),
      symbols: new Map(),
      imports: new Map(),
      exports: new Map(),
      recentFiles: [],
    };
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  }

  async initialize(): Promise<void> {
    if (!this.workspaceRoot) {
      return;
    }
    await this.buildIndex();
    this.setupFileWatcher();
  }

  getIndex(): WorkspaceIndex {
    return this.index;
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  private async buildIndex(): Promise<void> {
    const files = await this.walkDirectory(this.workspaceRoot);
    for (const filePath of files) {
      await this.indexFile(filePath);
    }
  }

  private async walkDirectory(dir: string): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            const subFiles = await this.walkDirectory(fullPath);
            results.push(...subFiles);
          }
        } else if (entry.isFile()) {
          if (IGNORED_FILE_NAMES.has(entry.name)) {
            continue;
          }
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // Permission denied or other error, skip
    }
    return results;
  }

  private async indexFile(filePath: string): Promise<void> {
    try {
      const stat = fs.statSync(filePath);
      const relativePath = path.relative(this.workspaceRoot, filePath);
      const language = getLanguage(filePath);

      const fileInfo: FileInfo = {
        path: filePath,
        relativePath,
        language,
        size: stat.size,
        lastModified: stat.mtimeMs,
      };
      this.index.files.set(filePath, fileInfo);

      if (stat.size < 500_000) {
        const content = fs.readFileSync(filePath, 'utf-8');
        this.parseSymbols(filePath, content, language);
        this.parseImports(filePath, content, language);
      }
    } catch {
      // File may have been deleted between walk and index
    }
  }

  private parseSymbols(filePath: string, content: string, language: string): void {
    const symbols: SymbolInfo[] = [];
    const lines = content.split('\n');

    const tsLike = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'];
    if (tsLike.includes(language)) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
        if (funcMatch) {
          symbols.push({ name: funcMatch[1], kind: 'function', filePath, line: i + 1 });
        }

        const classMatch = line.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
        if (classMatch) {
          symbols.push({ name: classMatch[1], kind: 'class', filePath, line: i + 1 });
        }

        const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
        if (interfaceMatch) {
          symbols.push({ name: interfaceMatch[1], kind: 'interface', filePath, line: i + 1 });
        }

        const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)\s*=/);
        if (typeMatch) {
          symbols.push({ name: typeMatch[1], kind: 'type', filePath, line: i + 1 });
        }

        const enumMatch = line.match(/(?:export\s+)?enum\s+(\w+)/);
        if (enumMatch) {
          symbols.push({ name: enumMatch[1], kind: 'enum', filePath, line: i + 1 });
        }

        const constFuncMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/);
        if (constFuncMatch) {
          symbols.push({ name: constFuncMatch[1], kind: 'function', filePath, line: i + 1 });
        }
      }
    } else if (language === 'python') {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const defMatch = line.match(/^(?:async\s+)?def\s+(\w+)/);
        if (defMatch) {
          symbols.push({ name: defMatch[1], kind: 'function', filePath, line: i + 1 });
        }
        const pyClassMatch = line.match(/^class\s+(\w+)/);
        if (pyClassMatch) {
          symbols.push({ name: pyClassMatch[1], kind: 'class', filePath, line: i + 1 });
        }
      }
    }

    if (symbols.length > 0) {
      this.index.symbols.set(filePath, symbols);

      const exportedNames: string[] = [];
      for (const sym of symbols) {
        const line = lines[sym.line - 1];
        if (line.includes('export')) {
          exportedNames.push(sym.name);
        }
      }
      if (exportedNames.length > 0) {
        this.index.exports.set(filePath, exportedNames);
      }
    }
  }

  private parseImports(filePath: string, content: string, language: string): void {
    const imports: ImportInfo[] = [];
    const tsLike = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'];

    if (tsLike.includes(language)) {
      const importRegex = /import\s+(?:\{([^}]+)\}|(\w+)(?:\s*,\s*\{([^}]+)\})?)\s+from\s+['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(content)) !== null) {
        const namedImports = match[1] || match[3] || '';
        const defaultImport = match[2] || '';
        const source = match[4];

        const specifiers: string[] = [];
        if (defaultImport) {
          specifiers.push(defaultImport);
        }
        if (namedImports) {
          specifiers.push(...namedImports.split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean));
        }

        imports.push({ source, specifiers, filePath });
      }
    } else if (language === 'python') {
      const pyImportRegex = /(?:from\s+(\S+)\s+import\s+(.+)|import\s+(\S+))/g;
      let match: RegExpExecArray | null;
      while ((match = pyImportRegex.exec(content)) !== null) {
        const source = match[1] || match[3] || '';
        const specifiers = match[2] ? match[2].split(',').map(s => s.trim()) : [source];
        imports.push({ source, specifiers, filePath });
      }
    }

    if (imports.length > 0) {
      this.index.imports.set(filePath, imports);
    }
  }

  private setupFileWatcher(): void {
    this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');

    this.fileWatcher.onDidChange(async (uri) => {
      const filePath = uri.fsPath;
      if (this.shouldIndex(filePath)) {
        await this.indexFile(filePath);
        this.trackRecentFile(filePath);
      }
    });

    this.fileWatcher.onDidCreate(async (uri) => {
      const filePath = uri.fsPath;
      if (this.shouldIndex(filePath)) {
        await this.indexFile(filePath);
      }
    });

    this.fileWatcher.onDidDelete((uri) => {
      const filePath = uri.fsPath;
      this.index.files.delete(filePath);
      this.index.symbols.delete(filePath);
      this.index.imports.delete(filePath);
      this.index.exports.delete(filePath);
    });
  }

  private shouldIndex(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return false;
    }
    const relative = path.relative(this.workspaceRoot, filePath);
    const parts = relative.split(path.sep);
    if (parts.some(p => IGNORED_DIRS.has(p))) {
      return false;
    }
    if (IGNORED_FILE_NAMES.has(path.basename(filePath))) {
      return false;
    }
    return true;
  }

  private trackRecentFile(filePath: string): void {
    this.index.recentFiles = this.index.recentFiles.filter(f => f !== filePath);
    this.index.recentFiles.unshift(filePath);
    if (this.index.recentFiles.length > 20) {
      this.index.recentFiles = this.index.recentFiles.slice(0, 20);
    }
  }

  getAllFiles(): Array<{ path: string; relativePath: string; language: string; size: number }> {
    const results: Array<{ path: string; relativePath: string; language: string; size: number }> = [];
    for (const [, fileInfo] of this.index.files) {
      results.push({
        path: fileInfo.path,
        relativePath: fileInfo.relativePath,
        language: fileInfo.language,
        size: fileInfo.size,
      });
    }
    return results;
  }

  indexWorkspace(): void {
    this.initialize().catch(err => console.error('[Andor] Re-index failed:', err));
  }

  async refreshFile(filePath: string): Promise<void> {
    if (this.shouldIndex(filePath)) {
      await this.indexFile(filePath);
      this.trackRecentFile(filePath);
    }
  }

  dispose(): void {
    this.fileWatcher?.dispose();
  }
}
