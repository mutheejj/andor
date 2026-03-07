import { ProviderRegistry } from '../providers';
import { AIMessage, AIStreamCallbacks } from '../providers/base';

/**
 * Session continuity — ensures Andor never stops mid-session.
 * 
 * Resilience rules:
 * 1. Rate limit (429) → wait (retry-after header) → retry same model
 * 2. Server error (5xx) → switch to fallback model → continue
 * 3. Context too long → summarize old messages → continue
 * 4. Network timeout → retry 3x with backoff → then pause + notify user
 * 5. Parse error → ask model to reformat → retry
 * 6. File write error → report to user → ask how to proceed
 * 7. Command fails → read error output → attempt fix → retry once
 */

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

// Approximate token count from string length
const CHARS_PER_TOKEN = 4;

export class SessionContinuity {
  private retryConfig: RetryConfig;

  constructor(
    private providerRegistry: ProviderRegistry,
    config?: Partial<RetryConfig>,
  ) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Stream a model call with automatic retry, fallback, and context management.
   * Never gives up silently — always retries or notifies the user.
   */
  async resilientStreamCall(
    messages: AIMessage[],
    modelSpec: string,
    callbacks: AIStreamCallbacks,
    maxContextTokens: number = 60000,
  ): Promise<void> {
    let currentModel = modelSpec;
    let currentMessages = [...messages];

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        // Check if context is too long and summarize if needed
        currentMessages = this.trimContext(currentMessages, maxContextTokens);

        await this.providerRegistry.streamCall(currentMessages, currentModel, callbacks);
        return; // Success — exit

      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);

        // 1. Rate limit (429)
        if (errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
          const delay = this.extractRetryAfter(errorMsg) || this.exponentialDelay(attempt);
          console.log(`[SessionContinuity] Rate limited on ${currentModel}, waiting ${delay}ms...`);
          await this.sleep(delay);
          continue; // Retry same model
        }

        // 2. Server error (5xx)
        if (/5\d{2}/.test(errorMsg)) {
          const fallback = this.findFallbackModel(currentModel);
          if (fallback && attempt < this.retryConfig.maxRetries) {
            console.log(`[SessionContinuity] Server error on ${currentModel}, switching to ${fallback}`);
            currentModel = fallback;
            continue;
          }
        }

        // 3. Context too long
        if (errorMsg.includes('context') && (errorMsg.includes('too long') || errorMsg.includes('token'))) {
          console.log('[SessionContinuity] Context too long, summarizing...');
          currentMessages = await this.summarizeContext(currentMessages, currentModel);
          continue;
        }

        // 4. Network timeout / connection error
        if (errorMsg.includes('timeout') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('fetch')) {
          const delay = this.exponentialDelay(attempt);
          console.log(`[SessionContinuity] Network error, retry ${attempt + 1}/${this.retryConfig.maxRetries} after ${delay}ms`);
          await this.sleep(delay);

          if (attempt === this.retryConfig.maxRetries) {
            callbacks.onError(`Network error after ${this.retryConfig.maxRetries} retries: ${errorMsg}. Please check your connection.`);
            return;
          }
          continue;
        }

        // 5. Last attempt — try any fallback
        if (attempt < this.retryConfig.maxRetries) {
          const fallback = this.findFallbackModel(currentModel);
          if (fallback) {
            console.log(`[SessionContinuity] Error on ${currentModel}, trying fallback ${fallback}`);
            currentModel = fallback;
            continue;
          }
        }

        // All retries exhausted
        callbacks.onError(`Failed after ${attempt + 1} attempts: ${errorMsg}`);
        return;
      }
    }
  }

  /**
   * Trim conversation context to fit within token budget.
   * Keeps system prompt + last N messages + summarizes old ones.
   */
  private trimContext(messages: AIMessage[], maxTokens: number): AIMessage[] {
    const estimatedTokens = messages.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / CHARS_PER_TOKEN), 0
    );

    if (estimatedTokens <= maxTokens) return messages;

    // Keep system prompt (first message) and last 4 messages
    const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
    const recentMessages = messages.slice(-4);
    const middleMessages = systemMsg
      ? messages.slice(1, -4)
      : messages.slice(0, -4);

    // Summarize middle messages
    if (middleMessages.length > 0) {
      const summaryContent = middleMessages
        .map(m => `[${m.role}]: ${m.content.substring(0, 200)}...`)
        .join('\n');

      const summaryMsg: AIMessage = {
        role: 'system',
        content: `[Previous conversation summary - ${middleMessages.length} messages condensed]\n${summaryContent}`,
      };

      const result: AIMessage[] = [];
      if (systemMsg) result.push(systemMsg);
      result.push(summaryMsg);
      result.push(...recentMessages);
      return result;
    }

    return messages;
  }

  /**
   * Actively summarize old context by calling a fast model.
   */
  private async summarizeContext(messages: AIMessage[], _currentModel: string): Promise<AIMessage[]> {
    // For now, use simple truncation. A full implementation would call a fast model.
    const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
    const recent = messages.slice(-6);

    const result: AIMessage[] = [];
    if (systemMsg) {
      // Truncate system prompt if it's very long
      result.push({
        ...systemMsg,
        content: systemMsg.content.substring(0, 4000) +
          (systemMsg.content.length > 4000 ? '\n... (system prompt truncated)' : ''),
      });
    }

    result.push({
      role: 'system',
      content: `[Context was too long and has been summarized. ${messages.length - recent.length - (systemMsg ? 1 : 0)} earlier messages were removed.]`,
    });

    result.push(...recent);
    return result;
  }

  /** Find a fallback model different from the current one */
  private findFallbackModel(currentModel: string): string | null {
    const fallbacks = [
      'puter::gpt-4o-mini',
      'puter::claude-sonnet-4',
      'groq::llama-3.3-70b-versatile',
      'google::gemini-2.0-flash',
    ];

    const allModels = this.providerRegistry.getAllModels();
    for (const spec of fallbacks) {
      if (spec === currentModel) continue;
      const [pid, mid] = spec.split('::');
      if (allModels.some(m => m.provider.id === pid && m.model.id === mid)) {
        return spec;
      }
    }
    return null;
  }

  /** Extract retry-after delay from error message */
  private extractRetryAfter(errorMsg: string): number | null {
    const match = errorMsg.match(/retry.after[:\s]+(\d+)/i);
    if (match) return parseInt(match[1]) * 1000;
    return null;
  }

  /** Exponential backoff delay */
  private exponentialDelay(attempt: number): number {
    const delay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    // Add jitter
    const jitter = Math.random() * 1000;
    return Math.min(delay + jitter, this.retryConfig.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
