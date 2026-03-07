import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import {
  ProjectMemory,
  SessionMemory,
  WorkspaceSnapshot,
  LearnedFact,
  UserPreference,
  TaskSummary,
  TechStack
} from '../types/core';

/**
 * MemoryManager stores all persistent data in VS Code's globalStorageUri,
 * NEVER inside the user's project folder. Each project gets its own
 * memory file keyed by a hash of the workspace root path.
 */
export class MemoryManager {
  private projectMemory?: ProjectMemory;
  private sessionMemory: SessionMemory;
  private snapshots: WorkspaceSnapshot[] = [];
  private workspaceRoot: string;
  private storageDir: string;
  private memoryFilePath: string;

  constructor(workspaceRoot: string, globalStoragePath: string) {
    this.workspaceRoot = workspaceRoot;
    this.storageDir = path.join(globalStoragePath, 'projects');
    const projectHash = this.computeProjectId();
    this.memoryFilePath = path.join(this.storageDir, `${projectHash}.json`);
    this.sessionMemory = {
      conversationHistory: [],
      fileChanges: new Map(),
      commandsRun: [],
      currentTask: undefined
    };
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    await this.loadProjectMemory();
    await this.cleanupOldProjectFile();
  }

  /** Remove the old .vscode/andor-memory.json if it exists from the previous version */
  private async cleanupOldProjectFile(): Promise<void> {
    try {
      const oldPath = path.join(this.workspaceRoot, '.vscode', 'andor-memory.json');
      await fs.unlink(oldPath);
      console.log('[MemoryManager] Cleaned up old in-project memory file');
    } catch {
      // File doesn't exist, nothing to clean
    }
  }

  private async loadProjectMemory(): Promise<void> {
    try {
      const content = await fs.readFile(this.memoryFilePath, 'utf-8');
      this.projectMemory = JSON.parse(content);
      console.log(`[MemoryManager] Loaded project memory from ${this.memoryFilePath}`);
    } catch {
      console.log('[MemoryManager] No existing project memory, creating new');
      this.projectMemory = {
        projectId: this.computeProjectId(),
        techStack: {
          languages: [],
          frameworks: [],
          buildTools: []
        },
        learnedFacts: [],
        userPreferences: [],
        taskHistory: [],
        lastUpdated: Date.now()
      };
      await this.saveProjectMemory();
    }
  }

  private async saveProjectMemory(): Promise<void> {
    if (!this.projectMemory) return;

    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      this.projectMemory.lastUpdated = Date.now();
      await fs.writeFile(
        this.memoryFilePath,
        JSON.stringify(this.projectMemory, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('[MemoryManager] Failed to save project memory:', error);
    }
  }

  private computeProjectId(): string {
    return crypto.createHash('md5').update(this.workspaceRoot).digest('hex');
  }

  getStoragePath(): string {
    return this.memoryFilePath;
  }

  async learnFact(fact: string, confidence: number = 1.0): Promise<void> {
    if (!this.projectMemory) return;

    const existing = this.projectMemory.learnedFacts.find(f => f.fact === fact);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.timestamp = Date.now();
    } else {
      this.projectMemory.learnedFacts.push({
        fact,
        confidence,
        timestamp: Date.now()
      });
    }

    await this.saveProjectMemory();
  }

  async setUserPreference(key: string, value: string): Promise<void> {
    if (!this.projectMemory) return;

    const existing = this.projectMemory.userPreferences.find(p => p.key === key);
    if (existing) {
      existing.value = value;
      existing.timestamp = Date.now();
    } else {
      this.projectMemory.userPreferences.push({
        key,
        value,
        timestamp: Date.now()
      });
    }

    await this.saveProjectMemory();
  }

  async updateTechStack(techStack: TechStack): Promise<void> {
    if (!this.projectMemory) return;

    this.projectMemory.techStack = techStack;
    await this.saveProjectMemory();
  }

  async addTaskToHistory(task: TaskSummary): Promise<void> {
    if (!this.projectMemory) return;

    this.projectMemory.taskHistory.unshift(task);

    if (this.projectMemory.taskHistory.length > 50) {
      this.projectMemory.taskHistory = this.projectMemory.taskHistory.slice(0, 50);
    }

    await this.saveProjectMemory();
  }

  async createSnapshot(description: string, diff: string): Promise<void> {
    const snapshot: WorkspaceSnapshot = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      description,
      diff
    };

    this.snapshots.push(snapshot);

    if (this.snapshots.length > 50) {
      this.snapshots = this.snapshots.slice(-50);
    }
  }

  getProjectMemory(): ProjectMemory | undefined {
    return this.projectMemory;
  }

  getSessionMemory(): SessionMemory {
    return this.sessionMemory;
  }

  getSnapshots(): WorkspaceSnapshot[] {
    return this.snapshots;
  }

  getLearnedFacts(): LearnedFact[] {
    return this.projectMemory?.learnedFacts || [];
  }

  getUserPreferences(): UserPreference[] {
    return this.projectMemory?.userPreferences || [];
  }

  getTaskHistory(): TaskSummary[] {
    return this.projectMemory?.taskHistory || [];
  }

  getTechStack(): TechStack | undefined {
    return this.projectMemory?.techStack;
  }

  addToConversationHistory(message: { role: string; content: string; timestamp: number }): void {
    this.sessionMemory.conversationHistory.push(message);
    // Keep last 100 messages in session
    if (this.sessionMemory.conversationHistory.length > 100) {
      this.sessionMemory.conversationHistory = this.sessionMemory.conversationHistory.slice(-100);
    }
  }

  trackFileChange(file: string, content: string): void {
    this.sessionMemory.fileChanges.set(file, content);
  }

  trackCommand(command: string): void {
    this.sessionMemory.commandsRun.push(command);
  }

  getFileChanges(): Map<string, string> {
    return this.sessionMemory.fileChanges;
  }

  getCommandsRun(): string[] {
    return this.sessionMemory.commandsRun;
  }

  formatProjectMemoryForContext(): string {
    if (!this.projectMemory) return '';

    const lines: string[] = [];

    if (this.projectMemory.techStack) {
      lines.push('## Tech Stack');
      if (this.projectMemory.techStack.languages.length > 0) {
        lines.push(`Languages: ${this.projectMemory.techStack.languages.join(', ')}`);
      }
      if (this.projectMemory.techStack.frameworks.length > 0) {
        lines.push(`Frameworks: ${this.projectMemory.techStack.frameworks.join(', ')}`);
      }
      if (this.projectMemory.techStack.buildTools.length > 0) {
        lines.push(`Build Tools: ${this.projectMemory.techStack.buildTools.join(', ')}`);
      }
      if (this.projectMemory.techStack.packageManager) {
        lines.push(`Package Manager: ${this.projectMemory.techStack.packageManager}`);
      }
      if (this.projectMemory.techStack.runtime) {
        lines.push(`Runtime: ${this.projectMemory.techStack.runtime}`);
      }
    }

    if (this.projectMemory.learnedFacts.length > 0) {
      lines.push('\n## Learned Facts');
      for (const fact of this.projectMemory.learnedFacts.slice(0, 10)) {
        lines.push(`- ${fact.fact}`);
      }
    }

    if (this.projectMemory.userPreferences.length > 0) {
      lines.push('\n## User Preferences');
      for (const pref of this.projectMemory.userPreferences) {
        lines.push(`- ${pref.key}: ${pref.value}`);
      }
    }

    if (this.projectMemory.taskHistory.length > 0) {
      lines.push('\n## Recent Tasks');
      for (const task of this.projectMemory.taskHistory.slice(0, 5)) {
        const timeAgo = this.formatTimeAgo(task.timestamp);
        lines.push(`- ${task.description} (${timeAgo}) ${task.success ? '✓' : '✗'}`);
      }
    }

    return lines.join('\n');
  }

  private formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  async clearProjectMemory(): Promise<void> {
    this.projectMemory = {
      projectId: this.computeProjectId(),
      techStack: {
        languages: [],
        frameworks: [],
        buildTools: []
      },
      learnedFacts: [],
      userPreferences: [],
      taskHistory: [],
      lastUpdated: Date.now()
    };
    await this.saveProjectMemory();
  }

  clearSessionMemory(): void {
    this.sessionMemory = {
      conversationHistory: [],
      fileChanges: new Map(),
      commandsRun: [],
      currentTask: undefined
    };
  }

  clearSnapshots(): void {
    this.snapshots = [];
  }
}
