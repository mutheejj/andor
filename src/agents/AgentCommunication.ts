import { SubAgentMessage, AgentHeartbeat } from './types';

type MessageHandler = (message: SubAgentMessage) => void;
type HeartbeatHandler = (heartbeat: AgentHeartbeat) => void;

/**
 * Event-based message passing between agents.
 * The orchestrator subscribes to messages from sub-agents.
 * Sub-agents post messages/heartbeats through this bus.
 */
export class AgentCommunication {
  private messageHandlers: Map<string, MessageHandler[]> = new Map();
  private globalHandlers: MessageHandler[] = [];
  private heartbeatHandlers: HeartbeatHandler[] = [];
  private messageQueue: SubAgentMessage[] = [];
  private isProcessing = false;

  /** Subscribe to messages from a specific agent */
  onAgentMessage(agentId: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(agentId)) {
      this.messageHandlers.set(agentId, []);
    }
    this.messageHandlers.get(agentId)!.push(handler);

    return () => {
      const handlers = this.messageHandlers.get(agentId);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    };
  }

  /** Subscribe to all agent messages (orchestrator uses this) */
  onAnyMessage(handler: MessageHandler): () => void {
    this.globalHandlers.push(handler);
    return () => {
      const idx = this.globalHandlers.indexOf(handler);
      if (idx >= 0) this.globalHandlers.splice(idx, 1);
    };
  }

  /** Subscribe to heartbeats (AgentPool uses this) */
  onHeartbeat(handler: HeartbeatHandler): () => void {
    this.heartbeatHandlers.push(handler);
    return () => {
      const idx = this.heartbeatHandlers.indexOf(handler);
      if (idx >= 0) this.heartbeatHandlers.splice(idx, 1);
    };
  }

  /** Post a message from a sub-agent */
  postMessage(message: SubAgentMessage): void {
    this.messageQueue.push(message);
    this.processQueue();
  }

  /** Post a heartbeat from a sub-agent */
  postHeartbeat(heartbeat: AgentHeartbeat): void {
    for (const handler of this.heartbeatHandlers) {
      try {
        handler(heartbeat);
      } catch (err) {
        console.error('[AgentComm] Heartbeat handler error:', err);
      }
    }
  }

  /** Process queued messages asynchronously */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;

      // Notify specific agent handlers
      const agentHandlers = this.messageHandlers.get(message.agentId) ?? [];
      for (const handler of agentHandlers) {
        try {
          handler(message);
        } catch (err) {
          console.error(`[AgentComm] Handler error for ${message.agentId}:`, err);
        }
      }

      // Notify global handlers
      for (const handler of this.globalHandlers) {
        try {
          handler(message);
        } catch (err) {
          console.error('[AgentComm] Global handler error:', err);
        }
      }

      // Yield to event loop between messages
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    this.isProcessing = false;
  }

  /** Clear all handlers (cleanup) */
  dispose(): void {
    this.messageHandlers.clear();
    this.globalHandlers = [];
    this.heartbeatHandlers = [];
    this.messageQueue = [];
  }
}
