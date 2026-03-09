import {
  AgentConfig, AgentStatus, AgentTask, AgentResult,
  SubAgentMessage, AgentHeartbeat,
} from './types';
import { AgentCommunication } from './AgentCommunication';
import { AgentMemory } from './AgentMemory';
import { ProviderRegistry } from '../providers';
import { AIMessage, AIStreamCallbacks } from '../providers/base';

interface ParsedAgentResponse {
  analysis: string;
  plan: string;
  execution: string;
  verification: string;
  blockers: string;
  completion: 'complete' | 'incomplete' | 'blocked';
  raw: string;
}

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
  private latestStructuredResponse: ParsedAgentResponse | null = null;

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
    this.latestStructuredResponse = null;
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
          this.postProgress('Model call failed, retrying once...');
          const retry = await this.callModel();
          if (!retry) {
            return this.makeResult('failure', 'Model did not return a usable response after retry.', 'Model call failed twice');
          }
          fullOutput = retry;
        } else {
          fullOutput = response;
        }

        const parsed = this.parseStructuredResponse(fullOutput);
        this.latestStructuredResponse = parsed;
        this.conversationHistory.push({ role: 'assistant', content: fullOutput });
        this.stepsCompleted = this.iterationCount;

        const progressSummary = this.summarizeProgress(parsed);
        if (progressSummary) {
          this.currentStep = progressSummary;
          this.postProgress(progressSummary);
        }

        if (this.isTaskComplete(parsed)) {
          break;
        }

        if (parsed.completion === 'blocked') {
          return this.makeResult('partial', fullOutput, this.extractBlockerMessage(parsed));
        }

        const continuationPrompt = this.buildContinuationPrompt(parsed);
        this.conversationHistory.push({
          role: 'user',
          content: continuationPrompt,
        });
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
      return this.makeResult('failure', errorMsg, errorMsg);
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
      coder: `You are a senior software engineer focused on implementation. Produce minimal, correct, production-ready changes that fit the existing architecture.`,
      debugger: `You are a senior debugging engineer. Start from evidence, isolate the root cause, explain the failure chain, and propose the smallest reliable fix.`,
      tester: `You are a senior test engineer. Design tests that validate behavior, regressions, and edge cases using the existing testing patterns in the repository.`,
      reviewer: `You are a senior code reviewer. Look for correctness, maintainability, security, performance, and architectural drift. Be concrete and prioritised.`,
      researcher: `You are a senior codebase researcher. Build an accurate mental model of responsibilities, call flows, invariants, and high-risk areas before concluding.`,
      terminal: `You are a senior terminal and runtime specialist. Suggest or execute the most informative commands, interpret outputs precisely, and surface actionable next steps.`,
      planner: `You are a senior engineering planner. Decompose work into clear, dependency-aware tasks that can be executed independently with strong handoff quality.`,
    };

    return `${rolePrompts[this.role] || rolePrompts.coder}

Operating rules:
- First understand the task and relevant code before concluding.
- Prefer root-cause fixes over superficial patches.
- Be explicit about assumptions and blockers.
- If evidence is insufficient, say what must be checked next.
- Keep outputs concise but concrete.

Response format:
## Analysis
Short understanding of the problem, relevant files, architecture, and constraints.

## Plan
Numbered plan for the next concrete actions.

## Execution
What you did, found, or would change. Reference files/functions when relevant.

## Verification
How the result was verified, or why verification is still pending.

## Blockers
State blockers or write "None".

## Completion
Write exactly one of: COMPLETE, INCOMPLETE, BLOCKED`;
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

    parts.push('## Expectations\nAct like a senior engineer. Understand first, then act. Ground claims in the provided context. Keep the response in the required sectioned format. Mark Completion as COMPLETE only if the assigned task is actually finished.');

    return parts.join('\n\n');
  }

  private parseStructuredResponse(output: string): ParsedAgentResponse {
    const readSection = (name: string, fallback = ''): string => {
      const pattern = new RegExp(`## ${name}\\s*([\\s\\S]*?)(?=\\n## [A-Za-z]+|$)`, 'i');
      const match = output.match(pattern);
      return match?.[1]?.trim() || fallback;
    };

    const completionRaw = readSection('Completion', '').toUpperCase();
    let completion: ParsedAgentResponse['completion'] = 'incomplete';
    if (completionRaw.includes('COMPLETE')) {
      completion = 'complete';
    }
    if (completionRaw.includes('BLOCKED')) {
      completion = 'blocked';
    }
    if (completionRaw.includes('INCOMPLETE')) {
      completion = 'incomplete';
    }

    return {
      analysis: readSection('Analysis'),
      plan: readSection('Plan'),
      execution: readSection('Execution'),
      verification: readSection('Verification'),
      blockers: readSection('Blockers', 'None'),
      completion,
      raw: output,
    };
  }

  private isTaskComplete(response: ParsedAgentResponse): boolean {
    if (response.completion === 'complete') {
      return true;
    }

    const raw = response.raw;
    return raw.includes('TASK_COMPLETE') ||
           raw.includes('Task complete') ||
           raw.includes('task complete');
  }

  private summarizeProgress(response: ParsedAgentResponse): string {
    const candidate = response.execution || response.plan || response.analysis;
    const normalized = candidate.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return `Step ${this.iterationCount}`;
    }
    return normalized.slice(0, 140);
  }

  private buildContinuationPrompt(response: ParsedAgentResponse): string {
    const blockers = response.blockers && response.blockers.toLowerCase() !== 'none'
      ? `Current blockers:\n${response.blockers}`
      : 'Current blockers: None identified.';

    return `Continue the assigned task using the same response format.

Previous execution summary:
${response.execution || 'No execution details were provided.'}

Previous verification summary:
${response.verification || 'No verification details were provided.'}

${blockers}

If the task is still not complete, refine the plan and continue. If you cannot proceed due to missing information or permissions, mark Completion as BLOCKED.`;
  }

  private extractBlockerMessage(response: ParsedAgentResponse): string {
    const blockerText = response.blockers && response.blockers.toLowerCase() !== 'none'
      ? response.blockers
      : 'Task is blocked and requires additional input or execution capability.';
    return blockerText;
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
    error?: string,
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
      error,
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
