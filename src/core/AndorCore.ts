import * as vscode from 'vscode';
import { CodebaseIndexer } from '../indexing/CodebaseIndexer';
import { ContextAssembler } from '../context/ContextAssembler';
import { WorkspaceWatcher } from '../indexing/WorkspaceWatcher';
import { DiagnosticsProvider } from '../context/DiagnosticsProvider';
import { MemoryManager } from '../memory/MemoryManager';
import { AgentLoop, AgentLoopCallbacks } from './AgentLoop';
import { AgentStep } from '../types/core';

export interface IndexingStatus {
  state: 'idle' | 'indexing' | 'ready' | 'error';
  progress: number; // 0-100
  totalFiles: number;
  indexedFiles: number;
  currentFile?: string;
  message: string;
}

export class AndorCore {
  private indexer: CodebaseIndexer;
  private contextAssembler: ContextAssembler;
  private workspaceWatcher: WorkspaceWatcher;
  private diagnosticsProvider: DiagnosticsProvider;
  private memoryManager: MemoryManager;
  private agentLoop: AgentLoop;
  private workspaceRoot: string;
  private globalStoragePath: string;
  private initialized: boolean = false;
  private indexingStatus: IndexingStatus = {
    state: 'idle', progress: 0, totalFiles: 0, indexedFiles: 0, message: 'Not started'
  };

  private onStepUpdateCallback?: (steps: AgentStep[]) => void;
  private onTaskCompleteCallback?: (success: boolean) => void;
  private onIndexingStatusCallback?: (status: IndexingStatus) => void;

  constructor(workspaceRoot: string, globalStoragePath: string) {
    this.workspaceRoot = workspaceRoot;
    this.globalStoragePath = globalStoragePath;

    this.indexer = new CodebaseIndexer();
    this.contextAssembler = new ContextAssembler(this.indexer);
    this.diagnosticsProvider = new DiagnosticsProvider();
    this.memoryManager = new MemoryManager(workspaceRoot, globalStoragePath);
    this.workspaceWatcher = new WorkspaceWatcher(this.indexer, this.contextAssembler);
    
    this.workspaceWatcher.setDiagnosticsProvider(this.diagnosticsProvider);

    const callbacks: AgentLoopCallbacks = {
      onStepStart: (step) => {
        console.log(`[Andor] Step started: ${step.type} - ${step.description}`);
        if (this.onStepUpdateCallback) {
          this.onStepUpdateCallback(this.agentLoop.getCurrentSteps());
        }
      },
      onStepComplete: (step) => {
        console.log(`[Andor] Step completed: ${step.type} - ${step.description}`);
        if (this.onStepUpdateCallback) {
          this.onStepUpdateCallback(this.agentLoop.getCurrentSteps());
        }
      },
      onStepFailed: (step) => {
        console.log(`[Andor] Step failed: ${step.type} - ${step.description}`, step.error);
        if (this.onStepUpdateCallback) {
          this.onStepUpdateCallback(this.agentLoop.getCurrentSteps());
        }
      },
      onTaskComplete: (success) => {
        console.log(`[Andor] Task complete: ${success ? 'success' : 'failed'}`);
        if (this.onTaskCompleteCallback) {
          this.onTaskCompleteCallback(success);
        }
      }
    };

    this.agentLoop = new AgentLoop(
      this.contextAssembler,
      this.diagnosticsProvider,
      this.memoryManager,
      callbacks
    );

    this.setupDiagnosticsMonitoring();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[Andor Core] Initializing...');
    const startTime = Date.now();

    this.updateIndexingStatus({ state: 'indexing', progress: 5, message: 'Loading project memory...' });
    await this.memoryManager.initialize();
    
    this.updateIndexingStatus({ state: 'indexing', progress: 10, message: 'Indexing workspace files...' });
    await this.indexer.fullIndex(this.workspaceRoot);
    
    const techStack = this.indexer.getTechStack();
    await this.memoryManager.updateTechStack(techStack);

    const stats = this.indexer.getStats();
    this.updateIndexingStatus({
      state: 'ready',
      progress: 100,
      totalFiles: stats.totalFiles,
      indexedFiles: stats.parsedFiles,
      message: `Indexed ${stats.parsedFiles} files, ${stats.totalSymbols} symbols in ${Date.now() - startTime}ms`
    });
    console.log(`[Andor Core] Initialized in ${Date.now() - startTime}ms`);
    console.log(`[Andor Core] Indexed ${stats.parsedFiles} files, ${stats.totalSymbols} symbols`);

    this.initialized = true;
  }

  private updateIndexingStatus(partial: Partial<IndexingStatus>): void {
    this.indexingStatus = { ...this.indexingStatus, ...partial };
    if (this.onIndexingStatusCallback) {
      this.onIndexingStatusCallback(this.indexingStatus);
    }
  }

  setOnIndexingStatusCallback(callback: (status: IndexingStatus) => void): void {
    this.onIndexingStatusCallback = callback;
  }

  getIndexingStatus(): IndexingStatus {
    return this.indexingStatus;
  }

  private setupDiagnosticsMonitoring(): void {
    this.diagnosticsProvider.setOnDiagnosticsChangeCallback((newErrors) => {
      console.log(`[Andor Core] New errors detected: ${newErrors.length}`);
      
      if (this.agentLoop.isTaskRunning()) {
        console.log('[Andor Core] Agent is running, errors may be related to recent changes');
      }
    });

    this.workspaceWatcher.setOnFileChangeCallback((file, changeType) => {
      console.log(`[Andor Core] File ${changeType}: ${file}`);
    });
  }

  async executeTask(userMessage: string, streamChat: (prompt: string) => Promise<string>): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.agentLoop.executeTask(userMessage, streamChat);
  }

  async assembleContext(userMessage: string) {
    if (!this.initialized) {
      await this.initialize();
    }

    const diagnostics = this.diagnosticsProvider.getAllDiagnostics();
    return await this.contextAssembler.assembleContext(userMessage, diagnostics);
  }

  getRepoMap(): string {
    return this.indexer.getRepoMap();
  }

  getDiagnostics() {
    return this.diagnosticsProvider.getAllDiagnostics();
  }

  getProjectMemory() {
    return this.memoryManager.getProjectMemory();
  }

  getSessionMemory() {
    return this.memoryManager.getSessionMemory();
  }

  getMemoryData(): unknown {
    return this.memoryManager.getProjectMemory();
  }

  async clearMemory(): Promise<void> {
    await this.memoryManager.clearProjectMemory();
    this.memoryManager.clearSessionMemory();
  }

  getCurrentSteps(): AgentStep[] {
    return this.agentLoop.getCurrentSteps();
  }

  getStats() {
    return {
      indexStats: this.indexer.getStats(),
      errorCount: this.diagnosticsProvider.getErrorCount(),
      warningCount: this.diagnosticsProvider.getWarningCount(),
      techStack: this.indexer.getTechStack(),
      recentChanges: this.workspaceWatcher.getRecentlyChangedFiles()
    };
  }

  setOnStepUpdateCallback(callback: (steps: AgentStep[]) => void): void {
    this.onStepUpdateCallback = callback;
  }

  setOnTaskCompleteCallback(callback: (success: boolean) => void): void {
    this.onTaskCompleteCallback = callback;
  }

  abortTask(): void {
    this.agentLoop.abort();
  }

  async reindexFile(filePath: string): Promise<void> {
    await this.indexer.reindexFile(filePath);
  }

  async learnFact(fact: string, confidence: number = 1.0): Promise<void> {
    await this.memoryManager.learnFact(fact, confidence);
  }

  async setUserPreference(key: string, value: string): Promise<void> {
    await this.memoryManager.setUserPreference(key, value);
  }

  trackFileChange(file: string, content: string): void {
    this.memoryManager.trackFileChange(file, content);
  }

  trackCommand(command: string): void {
    this.memoryManager.trackCommand(command);
  }

  dispose(): void {
    this.workspaceWatcher.dispose();
  }
}
