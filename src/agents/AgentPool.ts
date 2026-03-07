import { AgentHeartbeat, AgentStatus, AgentUIState } from './types';
import { SubAgent } from './SubAgent';
import { AgentCommunication } from './AgentCommunication';

interface AgentEntry {
  agent: SubAgent;
  lastHeartbeat: number;
  isDead: boolean;
}

export class AgentPool {
  private agents: Map<string, AgentEntry> = new Map();
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private onDeadAgent?: (agentId: string) => void;
  private onStatusChange?: (states: AgentUIState[]) => void;

  constructor(
    private comm: AgentCommunication,
    private heartbeatTimeoutMs: number = 10000,
    private maxRuntimeMs: number = 5 * 60 * 1000,
  ) {
    // Listen for heartbeats
    this.comm.onHeartbeat((hb) => this.handleHeartbeat(hb));
  }

  /** Register a new agent in the pool */
  register(agent: SubAgent): void {
    this.agents.set(agent.id, {
      agent,
      lastHeartbeat: Date.now(),
      isDead: false,
    });
  }

  /** Remove an agent from the pool */
  unregister(agentId: string): void {
    this.agents.delete(agentId);
  }

  /** Get a registered agent */
  getAgent(agentId: string): SubAgent | undefined {
    return this.agents.get(agentId)?.agent;
  }

  /** Get all active (non-dead) agents */
  getActiveAgents(): SubAgent[] {
    return Array.from(this.agents.values())
      .filter(e => !e.isDead)
      .map(e => e.agent);
  }

  /** Set callback for dead agent detection */
  onAgentDead(handler: (agentId: string) => void): void {
    this.onDeadAgent = handler;
  }

  /** Set callback for status updates (for UI) */
  onStatusUpdate(handler: (states: AgentUIState[]) => void): void {
    this.onStatusChange = handler;
  }

  /** Start monitoring all agents */
  startMonitoring(): void {
    this.monitorTimer = setInterval(() => {
      this.checkAgents();
    }, 3000);
  }

  /** Stop monitoring */
  stopMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  /** Stop ALL agents immediately */
  stopAll(): void {
    for (const entry of this.agents.values()) {
      entry.agent.stop();
    }
    this.stopMonitoring();
  }

  /** Get current UI state for all agents */
  getUIStates(): AgentUIState[] {
    const states: AgentUIState[] = [];
    for (const [id, entry] of this.agents) {
      const agent = entry.agent;
      states.push({
        id,
        role: agent.role,
        status: entry.isDead ? 'failed' : agent.getStatus(),
        currentStep: agent.getCurrentStep(),
        stepsCompleted: agent.getStepsCompleted(),
        totalSteps: 20, // max iterations
        model: '', // filled by orchestrator
        tokensUsed: agent.getTokensUsed(),
        filesModified: agent.getFilesModified(),
        startedAt: agent.getStartedAt(),
        durationMs: agent.getDurationMs(),
      });
    }
    return states;
  }

  private handleHeartbeat(hb: AgentHeartbeat): void {
    const entry = this.agents.get(hb.agentId);
    if (entry) {
      entry.lastHeartbeat = hb.timestamp;
      entry.isDead = false;
    }

    // Emit status update to UI
    if (this.onStatusChange) {
      this.onStatusChange(this.getUIStates());
    }
  }

  private checkAgents(): void {
    const now = Date.now();

    for (const [agentId, entry] of this.agents) {
      const agent = entry.agent;
      const status = agent.getStatus();

      // Skip finished agents
      if (status === 'done' || status === 'failed' || status === 'stopped') continue;

      // Check heartbeat timeout
      if (now - entry.lastHeartbeat > this.heartbeatTimeoutMs && !entry.isDead) {
        entry.isDead = true;
        console.warn(`[AgentPool] Agent ${agentId} heartbeat timeout — marked dead`);
        this.onDeadAgent?.(agentId);
      }

      // Check max runtime
      const runtime = agent.getDurationMs();
      if (runtime > this.maxRuntimeMs) {
        console.warn(`[AgentPool] Agent ${agentId} exceeded max runtime (${runtime}ms) — stopping`);
        agent.stop();
      }
    }

    // Emit status update
    if (this.onStatusChange) {
      this.onStatusChange(this.getUIStates());
    }
  }

  /** Cleanup */
  dispose(): void {
    this.stopAll();
    this.agents.clear();
  }
}
