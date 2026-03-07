import {
  AgentConfig, AgentStatus, AgentTask, AgentResult,
  SubAgentMessage, AgentHeartbeat,
} from './types';
import { AgentCommunication } from './AgentCommunication';
import { AgentMemory } from './AgentMemory';
import { ProviderRegistry } from '../providers';
import { AIMessage, AIStreamCallbacks } from '../providers/base';

export class SubAgent {
  readonly id: string;
  readonly role: AgentConfig['role'];
  private config: AgentConfig;
  private task: AgentTask | null = null;
  private status: AgentStatus = 'idle';
  private currentStep = '';
  private stepsCompleted = 0;
  private tokensUsed = 0;
  private filesModified: string[] = [];
  private commandsRun: string[] = [];
  private conversationHistory: AIMessage[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private stopRequested = false;
  private iterationCount = 0;

  constructor(
    config: AgentConfig,
    private comm: AgentCommunication,
    private memory: AgentMemory,
    private providerRegistry: ProviderRegistry,
  ) {
    this.id = config.id;
    this.role = config.role;
    this.config = config;
  }

  getStatus(): AgentStatus { return this.status; }
  getCurrentStep(): string { return this.currentStep; }
  getStepsCompleted(): number { return this.stepsCompleted; }
  getTokensUsed(): number { return this.tokensUsed; }
  getFilesModified(): string[] { return [...this.filesModified]; }
  getStartedAt(): number { return this.startedAt; }
  getDurationMs(): number { return this.startedAt ? Date.now() - this.startedAt : 0; }

  /** Assign a task to this agent */
  assignTask(task: AgentTask): void {
    this.task = task;
    this.status = 'idle';
    this.stepsCompleted = 0;
    this.tokensUsed = 0;
    this.filesModified = [];
    this.commandsRun = [];
    this.conversationHistory = [];
    this.iterationCount = 0;
    this.stopRequested = false;
  }

  /** Start executing the assigned task */
  async execute(): Promise<AgentResult> {
    if (!this.task) {
      return this.makeResult('failure', 'No task assigned');
    }

    this.startedAt = Date.now();
    this.status = 'thinking';
    this.startHeartbeat();

    try {
      // Build system prompt for this agent role
      const systemPrompt = this.buildSystemPrompt();
      this.conversationHistory.push({ role: 'system', content: systemPrompt });

      // Build initial user message with task + context
      const taskMessage = this.buildTaskMessage();
      this.conversationHistory.push({ role: 'user', content: taskMessage });

      this.postProgress('Starting task...');

      // Iterative execution loop
      let fullOutput = '';

      while (this.iterationCount < this.config.maxIterations && !this.stopRequested) {
        // Check max runtime
        if (Date.now() - this.startedAt > this.config.maxRuntimeMs) {
          this.postProgress('Max runtime reached, wrapping up...');
          break;
        }

        this.iterationCount++;
        this.status = 'working';
        this.currentStep = `Step ${this.iterationCount}`;

        const response = await this.callModel();
        if (!response) {
          if (this.stopRequested) break;
          // Retry once on failure
          const retry = await this.callModel();
          if (!retry) break;
          fullOutput += retry;
        } else {
          fullOutput += response;
        }

        this.conversationHistory.push({ role: 'assistant', content: fullOutput });
        this.stepsCompleted = this.iterationCount;

        // Check if the agent considers itself done
        if (this.isTaskComplete(fullOutput)) {
          break;
        }

        // If not done, add a continuation prompt
        this.conversationHistory.push({
          role: 'user',
          content: 'Continue. If you are done, end with "TASK_COMPLETE".',
        });

        fullOutput = ''; // Reset for next iteration
      }

      this.stopHeartbeat();

      if (this.stopRequested) {
        this.status = 'stopped';
        return this.makeResult('stopped', fullOutput || 'Stopped by user');
      }

      this.status = 'done';
      this.postProgress('Task completed');
      return this.makeResult('success', fullOutput);

    } catch (err) {
      this.stopHeartbeat();
      this.status = 'failed';
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.postProgress(`Failed: ${errorMsg}`);
      return this.makeResult('failure', errorMsg);
    }
  }

  /** Request this agent to stop */
  stop(): void {
    this.stopRequested = true;
    this.status = 'stopped';
    this.stopHeartbeat();
  }

  private async callModel(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      let fullText = '';
      const timeout = setTimeout(() => {
        resolve(fullText || null);
      }, 60000); // 60s timeout per call

      const callbacks: AIStreamCallbacks = {
        onChunk: (text: string) => {
          fullText += text;
          if (this.stopRequested) {
            // Can't cancel stream mid-flight, but we'll ignore the rest
          }
        },
        onDone: (_full, response) => {
          clearTimeout(timeout);
          this.tokensUsed += response.tokensUsed ?? 0;
          resolve(fullText);
        },
        onError: (error: string) => {
          clearTimeout(timeout);
          console.error(`[SubAgent ${this.id}] Model error: ${error}`);
          resolve(null);
        },
      };

      this.providerRegistry.streamCall(
        this.conversationHistory,
        this.config.modelSpec,
        callbacks,
      ).catch(() => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
  }

  private buildSystemPrompt(): string {
    const rolePrompts: Record<string, string> = {
      coder: `You are an expert code writer. Write clean, type-safe, production-quality code. Use write: blocks for file creation. Focus on implementation, not explanation.`,
      debugger: `You are an expert debugger. Analyze errors systematically: read the error, trace the cause, fix the root issue. Never guess — reason from evidence.`,
      tester: `You are a test engineer. Write comprehensive tests covering edge cases. Use the project's existing test framework. Verify tests pass.`,
      reviewer: `You are a code reviewer. Check for: bugs, type errors, security issues, performance problems, style violations. Be specific and actionable.`,
      researcher: `You are a codebase researcher. Read and understand code structure, dependencies, and patterns. Report findings clearly.`,
      terminal: `You are a terminal specialist. Run commands, read output, diagnose failures. Use run: blocks for commands.`,
      planner: `You are a task planner. Break complex tasks into specific, actionable sub-tasks. Each sub-task should be completable by one agent.`,
    };

    return rolePrompts[this.role] || rolePrompts.coder;
  }

  private buildTaskMessage(): string {
    if (!this.task) return '';

    const parts: string[] = [];
    parts.push(`## Task\n${this.task.description}`);

    if (this.task.context) {
      parts.push(`## Context\n${this.task.context}`);
    }

    // Include shared memory context
    const taskContext = this.memory.getTaskContext();
    if (taskContext) {
      parts.push(`## Project Context\n${taskContext}`);
    }

    const codebaseMap = this.memory.getCodebaseMap();
    if (codebaseMap) {
      parts.push(`## Codebase Map\n${codebaseMap}`);
    }

    // Include relevant completed work from other agents
    const completed = this.memory.getCompletedWork();
    const relevantWork = Object.entries(completed)
      .filter(([id]) => id !== this.id)
      .map(([id, result]) => `${id}: ${result.output.substring(0, 300)}`);
    if (relevantWork.length > 0) {
      parts.push(`## Work completed by other agents\n${relevantWork.join('\n')}`);
    }

    parts.push('\nWhen done, end your response with "TASK_COMPLETE".');

    return parts.join('\n\n');
  }

  private isTaskComplete(output: string): boolean {
    return output.includes('TASK_COMPLETE') ||
           output.includes('Task complete') ||
           output.includes('task complete');
  }

  private postProgress(content: string): void {
    const msg: SubAgentMessage = {
      agentId: this.id,
      type: 'progress',
      content,
      filesModified: this.filesModified,
      commandsRun: this.commandsRun,
      tokensUsed: this.tokensUsed,
      timestamp: Date.now(),
    };
    this.comm.postMessage(msg);
  }

  private makeResult(
    status: AgentResult['status'],
    output: string,
  ): AgentResult {
    return {
      agentId: this.id,
      taskId: this.task?.id ?? '',
      status,
      output,
      filesModified: this.filesModified,
      commandsRun: this.commandsRun,
      tokensUsed: this.tokensUsed,
      durationMs: this.getDurationMs(),
    };
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const hb: AgentHeartbeat = {
        agentId: this.id,
        status: this.status,
        currentStep: this.currentStep,
        stepsCompleted: this.stepsCompleted,
        tokensUsed: this.tokensUsed,
        timestamp: Date.now(),
      };
      this.comm.postHeartbeat(hb);
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
