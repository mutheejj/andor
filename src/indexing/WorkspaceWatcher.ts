import * as vscode from 'vscode';
import { CodebaseIndexer } from './CodebaseIndexer';
import { ContextAssembler } from '../context/ContextAssembler';
import { DiagnosticsProvider } from '../context/DiagnosticsProvider';

interface FileChangeEvent {
  uri: vscode.Uri;
  type: 'create' | 'modify' | 'delete' | 'rename';
  timestamp: number;
}

export class WorkspaceWatcher {
  private indexer: CodebaseIndexer;
  private contextAssembler: ContextAssembler;
  private diagnosticsProvider?: DiagnosticsProvider;
  private fileWatcher?: vscode.FileSystemWatcher;
  private changeBuffer: Map<string, FileChangeEvent> = new Map();
  private debounceTimer?: NodeJS.Timeout;
  private recentlyChanged: Map<string, number> = new Map();
  private isUserEditing: boolean = false;
  private onFileChangeCallback?: (file: string, changeType: 'create' | 'modify' | 'delete') => void;

  constructor(indexer: CodebaseIndexer, contextAssembler: ContextAssembler) {
    this.indexer = indexer;
    this.contextAssembler = contextAssembler;
    this.setupFileWatcher();
    this.setupEditDetection();
  }

  setDiagnosticsProvider(provider: DiagnosticsProvider): void {
    this.diagnosticsProvider = provider;
  }

  setOnFileChangeCallback(callback: (file: string, changeType: 'create' | 'modify' | 'delete') => void): void {
    this.onFileChangeCallback = callback;
  }

  private setupFileWatcher(): void {
    const pattern = '**/*.{ts,tsx,js,jsx,py,go,rs,java,php,rb,cs}';
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.fileWatcher.onDidCreate(uri => {
      this.handleFileChange(uri, 'create');
    });

    this.fileWatcher.onDidChange(uri => {
      this.handleFileChange(uri, 'modify');
    });

    this.fileWatcher.onDidDelete(uri => {
      this.handleFileChange(uri, 'delete');
    });

    vscode.workspace.onDidSaveTextDocument(document => {
      this.handleFileSave(document);
    });
  }

  private setupEditDetection(): void {
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.contentChanges.length > 0) {
        this.isUserEditing = true;
        setTimeout(() => {
          this.isUserEditing = false;
        }, 2000);
      }
    });
  }

  private handleFileChange(uri: vscode.Uri, type: 'create' | 'modify' | 'delete'): void {
    const filePath = uri.fsPath;
    
    this.changeBuffer.set(filePath, {
      uri,
      type,
      timestamp: Date.now()
    });

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processBatchedChanges();
    }, 300);
  }

  private async handleFileSave(document: vscode.TextDocument): Promise<void> {
    const filePath = document.uri.fsPath;
    const startTime = Date.now();

    try {
      await this.indexer.reindexFile(filePath);
      const duration = Date.now() - startTime;
      
      console.log(`Re-indexed ${filePath} in ${duration}ms`);

      this.recentlyChanged.set(filePath, Date.now());
      this.contextAssembler.trackFileChange(filePath, 'modify');

      if (this.onFileChangeCallback) {
        this.onFileChangeCallback(filePath, 'modify');
      }

      setTimeout(() => {
        this.recentlyChanged.delete(filePath);
      }, 30 * 60 * 1000);
    } catch (error) {
      console.error(`Failed to re-index ${filePath}:`, error);
    }
  }

  private async processBatchedChanges(): Promise<void> {
    if (this.isUserEditing) {
      this.debounceTimer = setTimeout(() => {
        this.processBatchedChanges();
      }, 500);
      return;
    }

    const changes = Array.from(this.changeBuffer.values());
    this.changeBuffer.clear();

    for (const change of changes) {
      const filePath = change.uri.fsPath;

      try {
        if (change.type === 'create' || change.type === 'modify') {
          await this.indexer.indexFile(filePath);
          this.contextAssembler.trackFileChange(filePath, change.type);
          
          if (this.onFileChangeCallback) {
            this.onFileChangeCallback(filePath, change.type);
          }
        } else if (change.type === 'delete') {
          this.contextAssembler.trackFileChange(filePath, 'delete');
          
          if (this.onFileChangeCallback) {
            this.onFileChangeCallback(filePath, 'delete');
          }
        }

        this.recentlyChanged.set(filePath, Date.now());
      } catch (error) {
        console.error(`Failed to process change for ${filePath}:`, error);
      }
    }
  }

  getRecentlyChangedFiles(withinMinutes: number = 30): string[] {
    const cutoff = Date.now() - withinMinutes * 60 * 1000;
    const files: string[] = [];

    for (const [file, timestamp] of this.recentlyChanged.entries()) {
      if (timestamp > cutoff) {
        files.push(file);
      }
    }

    return files;
  }

  isFileRecentlyChanged(filePath: string, withinMinutes: number = 30): boolean {
    const timestamp = this.recentlyChanged.get(filePath);
    if (!timestamp) return false;

    const cutoff = Date.now() - withinMinutes * 60 * 1000;
    return timestamp > cutoff;
  }

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.changeBuffer.clear();
    this.recentlyChanged.clear();
  }
}
