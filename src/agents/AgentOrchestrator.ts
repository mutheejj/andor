import * as crypto from 'crypto';
import {
  AgentRole, AgentConfig, AgentTask, AgentResult,
  AgentPlan, AgentPlanStep, AgentDashboardState, AgentUIState,
  SubAgentMessage,
} from './types';
import { SubAgent } from './SubAgent';
import { AgentPool } from './AgentPool';
import { AgentCommunication } from './AgentCommunication';
import { AgentMemory } from './AgentMemory';
import { ModelSelector } from './ModelSelector';
import { ProviderRegistry } from '../providers';
import { AIMessage } from '../providers/base';

const DEFAULT_MAX_ITERATIONS = 20;
const DEFAULT_MAX_RUNTIME_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_HEARTBEAT_INTERVAL = 3000;
const DEFAULT_HEARTBEAT_TIMEOUT = 10000;

export type DashboardUpdateCallback = (state: AgentDashboardState) => void;

export class AgentOrchestrator {
  private comm: AgentCommunication;
  private pool: AgentPool;
  private memory: AgentMemory;
  private modelSelector: ModelSelector;
  private isRunning = false;
  private startedAt = 0;
  private taskDescription = '';
  private onDashboardUpdate?: DashboardUpdateCallback;
  private stopRequested = false;

  constructor(private providerRegistry: ProviderRegistry) {
    this.comm = new AgentCommunication();
    this.pool = new AgentPool(this.comm, DEFAULT_HEARTBEAT_TIMEOUT, DEFAULT_MAX_RUNTIME_MS);
    this.memory = new AgentMemory();
    this.modelSelector = new ModelSelector(providerRegistry);

    // Listen for all agent messages
    this.comm.onAnyMessage((msg) => this.handleAgentMessage(msg));

    // Listen for dead agents
    this.pool.onAgentDead((agentId) => this.handleDeadAgent(agentId));

    // Forward status updates to dashboard
    this.pool.onStatusUpdate(() => this.emitDashboardUpdate());
  }

  /** Set callback for UI dashboard updates */
  setDashboardCallback(cb: DashboardUpdateCallback): void {
    this.onDashboardUpdate = cb;
  }

  /** Is the orchestrator currently running a task? */
  getIsRunning(): boolean { return this.isRunning; }

  /**
   * Execute a user task. Analyzes complexity and either handles it
   * directly (simple) or spawns sub-agents (complex).
   */
  async executeTask(
    userMessage: string,
    codebaseContext: string,
    systemPrompt: string,
  ): Promise<AgentResult> {
    this.isRunning = true;
    this.startedAt = Date.now();
    this.taskDescription = userMessage;
    this.stopRequested = false;
    this.memory.reset();
    this.memory.setTaskContext(userMessage);
    this.memory.setCodebaseMap(codebaseContext);

    this.pool.startMonitoring();
    this.emitDashboardUpdate();

    try {
      // Step 1: Analyze complexity
      const complexity = this.analyzeComplexity(userMessage);

      if (complexity === 'simple') {
        // Handle with a single coder agent
        return await this.executeSingleAgent(userMessage, systemPrompt);
      }

      // Step 2: Plan sub-tasks
      const plan = await this.planTasks(userMessage, systemPrompt);
      if (!plan || plan.steps.length === 0) {
        // Fallback to single agent
        return await this.executeSingleAgent(userMessage, systemPrompt);
      }

      // Step 3: Execute sub-tasks
      return await this.executeMultiAgent(plan, systemPrompt);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        agentId: 'orchestrator',
        taskId: 'main',
        status: 'failure',
        output: `Orchestrator error: ${errorMsg}`,
        filesModified: this.memory.getModifiedFiles(),
        commandsRun: [],
        tokensUsed: 0,
        durationMs: Date.now() - this.startedAt,
        error: errorMsg,
      };
    } finally {
      this.isRunning = false;
      this.pool.stopMonitoring();
      this.emitDashboardUpdate();
    }
  }

  /** Stop all agents immediately */
  stopAll(): void {
    this.stopRequested = true;
    this.pool.stopAll();
    this.isRunning = false;
    this.emitDashboardUpdate();
  }

  /** Analyze task complexity to decide single vs multi-agent */
  private analyzeComplexity(message: string): 'simple' | 'complex' {
    const lower = message.toLowerCase();
    const complexSignals = [
      /\b(and then|also|additionally|furthermore)\b/,
      /\b(multiple files|several files|across|all files)\b/,
      /\b(refactor|migrate|redesign|restructure|overhaul)\b/,
      /\b(add tests|write tests|test coverage)\b/,
      /\b(debug.+and.+fix|fix.+and.+test)\b/,
      /\b(review.+and|audit)\b/,
    ];

    let complexCount = 0;
    for (const pattern of complexSignals) {
      if (pattern.test(lower)) complexCount++;
    }

    // Also check message length — long messages tend to be complex
    if (message.length > 300) complexCount++;

    return complexCount >= 2 ? 'complex' : 'simple';
  }

  /** Execute task with a single coder agent */
  private async executeSingleAgent(
    userMessage: string,
    _systemPrompt: string,
  ): Promise<AgentResult> {
    const modelSpec = this.modelSelector.selectForRole('coder');
    if (!modelSpec) {
      return this.makeFailure('No model available for coder agent');
    }

    const config: AgentConfig = {
      id: `coder-${this.shortId()}`,
      role: 'coder',
      modelSpec,
      maxIterations: DEFAULT_MAX_ITERATIONS,
      maxRuntimeMs: DEFAULT_MAX_RUNTIME_MS,
      heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL,
      heartbeatTimeoutMs: DEFAULT_HEARTBEAT_TIMEOUT,
    };

    const agent = new SubAgent(config, this.comm, this.memory, this.providerRegistry);
    agent.assignTask({
      id: 'main',
      description: userMessage,
      dependencies: [],
      context: this.memory.getCodebaseMap(),
      priority: 10,
    });

    this.pool.register(agent);
    this.emitDashboardUpdate();

    const result = await agent.execute();
    this.memory.addResult(agent.id, result);
    this.pool.unregister(agent.id);
    this.emitDashboardUpdate();

    return result;
  }

  /** Plan sub-tasks by asking a planner model */
  private async planTasks(
    userMessage: string,
    _systemPrompt: string,
  ): Promise<AgentPlan | null> {
    const plannerModel = this.modelSelector.selectForRole('planner');
    if (!plannerModel) return null;

    const planPrompt = `You are a task planner for a coding AI system. Break this task into 2-5 parallel sub-tasks.

User task: "${userMessage}"

Respond with a JSON array of sub-tasks:
[
  { "role": "coder|debugger|tester|reviewer|researcher|terminal", "description": "specific task", "dependencies": [], "priority": 10 }
]

Rules:
- Each sub-task should be specific and completable independently
- Use dependencies array to indicate which tasks must finish first (by index)
- Priority 1-10 (10=highest)
- Prefer parallel execution where possible
- Only use roles that match the work needed
- Return ONLY the JSON array, nothing else`;

    try {
      const response = await this.callModelSync(plannerModel, planPrompt);
      if (!response) return null;

      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return null;

      const tasks = JSON.parse(jsonMatch[0]) as Array<{
        role: AgentRole;
        description: string;
        dependencies: number[];
        priority: number;
      }>;

      const plan: AgentPlan = {
        taskId: 'main',
        steps: tasks.map((t, i) => ({
          id: `step-${i}`,
          description: t.description,
          assignedRole: t.role,
          dependencies: t.dependencies.map(d => `step-${d}`),
          estimatedComplexity: t.priority > 7 ? 'high' : t.priority > 4 ? 'medium' : 'low',
          status: 'pending' as const,
        })),
        createdAt: Date.now(),
      };

      return plan;
    } catch {
      return null;
    }
  }

  /** Execute multiple agents according to a plan */
  private async executeMultiAgent(
    plan: AgentPlan,
    _systemPrompt: string,
  ): Promise<AgentResult> {
    const results: AgentResult[] = [];
    const completedSteps = new Set<string>();

    // Process steps in waves based on dependencies
    while (!this.stopRequested) {
      // Find steps that are ready (all dependencies met)
      const readySteps = plan.steps.filter(s =>
        s.status === 'pending' &&
        s.dependencies.every(d => completedSteps.has(d))
      );

      if (readySteps.length === 0) {
        // Check if all done or stuck
        const pendingCount = plan.steps.filter(s => s.status === 'pending' || s.status === 'in_progress').length;
        if (pendingCount === 0) break; // All done
        // Stuck — break deadlock
        break;
      }

      // Launch ready steps in parallel
      const promises: Promise<AgentResult>[] = [];

      for (const step of readySteps) {
        step.status = 'in_progress';
        const modelSpec = this.modelSelector.selectForRole(step.assignedRole);
        if (!modelSpec) {
          step.status = 'skipped';
          completedSteps.add(step.id);
          continue;
        }

        const config: AgentConfig = {
          id: `${step.assignedRole}-${this.shortId()}`,
          role: step.assignedRole,
          modelSpec,
          maxIterations: DEFAULT_MAX_ITERATIONS,
          maxRuntimeMs: DEFAULT_MAX_RUNTIME_MS,
          heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL,
          heartbeatTimeoutMs: DEFAULT_HEARTBEAT_TIMEOUT,
        };

        const agent = new SubAgent(config, this.comm, this.memory, this.providerRegistry);
        agent.assignTask({
          id: step.id,
          description: step.description,
          dependencies: step.dependencies,
          context: this.memory.getCodebaseMap(),
          priority: step.estimatedComplexity === 'high' ? 10 : step.estimatedComplexity === 'medium' ? 5 : 1,
        });

        this.pool.register(agent);
        this.emitDashboardUpdate();

        promises.push(
          agent.execute().then(result => {
            this.memory.addResult(agent.id, result);
            step.status = result.status === 'success' ? 'done' : 'failed';
            completedSteps.add(step.id);
            this.pool.unregister(agent.id);
            this.emitDashboardUpdate();
            return result;
          })
        );
      }

      // Wait for this wave to complete
      const waveResults = await Promise.allSettled(promises);
      for (const wr of waveResults) {
        if (wr.status === 'fulfilled') {
          results.push(wr.value);
        }
      }
    }

    // Synthesize final result
    const allOutput = results.map(r => `[${r.agentId}] ${r.output}`).join('\n\n---\n\n');
    const allFiles = results.flatMap(r => r.filesModified);
    const allCommands = results.flatMap(r => r.commandsRun);
    const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed, 0);
    const anyFailed = results.some(r => r.status === 'failure');

    return {
      agentId: 'orchestrator',
      taskId: 'main',
      status: this.stopRequested ? 'stopped' : anyFailed ? 'partial' : 'success',
      output: allOutput,
      filesModified: [...new Set(allFiles)],
      commandsRun: allCommands,
      tokensUsed: totalTokens,
      durationMs: Date.now() - this.startedAt,
    };
  }

  /** Synchronous model call (non-streaming, for planner) */
  private callModelSync(modelSpec: string, prompt: string): Promise<string | null> {
    return new Promise((resolve) => {
      let fullText = '';
      const timeout = setTimeout(() => resolve(fullText || null), 30000);

      const messages: AIMessage[] = [
        { role: 'user', content: prompt },
      ];

      this.providerRegistry.streamCall(messages, modelSpec, {
        onChunk: (text) => { fullText += text; },
        onDone: () => { clearTimeout(timeout); resolve(fullText); },
        onError: () => { clearTimeout(timeout); resolve(null); },
      }).catch(() => { clearTimeout(timeout); resolve(null); });
    });
  }

  private handleAgentMessage(msg: SubAgentMessage): void {
    // Log progress for debugging
    if (msg.type === 'progress') {
      console.log(`[Agent ${msg.agentId}] ${msg.content}`);
    }
    this.emitDashboardUpdate();
  }

  private handleDeadAgent(agentId: string): void {
    console.warn(`[Orchestrator] Agent ${agentId} is dead, marking failed`);
    this.emitDashboardUpdate();
  }

  private emitDashboardUpdate(): void {
    if (!this.onDashboardUpdate) return;

    const state: AgentDashboardState = {
      taskDescription: this.taskDescription,
      agents: this.pool.getUIStates(),
      totalTokens: this.pool.getUIStates().reduce((s, a) => s + a.tokensUsed, 0),
      startedAt: this.startedAt,
      isRunning: this.isRunning,
    };

    this.onDashboardUpdate(state);
  }

  private makeFailure(error: string): AgentResult {
    return {
      agentId: 'orchestrator',
      taskId: 'main',
      status: 'failure',
      output: error,
      filesModified: [],
      commandsRun: [],
      tokensUsed: 0,
      durationMs: Date.now() - this.startedAt,
      error,
    };
  }

  private shortId(): string {
    return crypto.randomUUID().substring(0, 6);
  }

  dispose(): void {
    this.stopAll();
    this.comm.dispose();
    this.pool.dispose();
  }
}
