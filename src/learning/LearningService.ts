import * as vscode from 'vscode';
import { SupabaseClient } from './SupabaseClient';
import { PrivacyManager } from './PrivacyManager';
import { LocalLearning } from './LocalLearning';
import {
  FeedbackEvent, UsageEvent,
  ErrorSolutionEvent, ModelRecommendation,
  TaskType, Provider
} from './types';

const ANDOR_VERSION = '0.1.0';

export class LearningService {
  private supabase: SupabaseClient;
  private privacy: PrivacyManager;
  private local: LocalLearning;
  private sessionId: string = '';
  private isEnabled: boolean = false;

  constructor(private context: vscode.ExtensionContext) {
    this.supabase  = new SupabaseClient(context);
    this.privacy   = new PrivacyManager(context);
    this.local     = new LocalLearning(context);
  }

  async initialize(): Promise<void> {
    await this.supabase.initialize();
    this.sessionId = this.privacy.getSessionId();
    this.isEnabled = this.privacy.isOptedIn();

    if (this.supabase.isConfigured()) {
      this.isEnabled = await this.privacy.promptOptIn();
    }
  }

  getPrivacyManager(): PrivacyManager {
    return this.privacy;
  }

  async trackFeedback(event: Omit<FeedbackEvent, 'sessionId' | 'andorVersion'>): Promise<void> {
    if (!this.isEnabled) return;

    const full: FeedbackEvent = {
      ...event,
      sessionId: this.sessionId,
      andorVersion: ANDOR_VERSION,
    };

    // Always save locally
    await this.local.saveFeedback(full);

    // Send to Supabase (fire and forget)
    this.supabase.insert('response_feedback', {
      session_id:          full.sessionId,
      model_id:            full.modelId,
      provider:            full.provider,
      task_type:           full.taskType,
      language:            full.language,
      framework:           full.framework,
      accepted:            full.accepted,
      files_modified:      full.filesModified,
      response_tokens:     full.responseTokens,
      time_to_response_ms: full.timeToResponseMs,
      had_errors_before:   full.hadErrorsBefore,
      errors_resolved:     full.errorsResolved,
      andor_version:       full.andorVersion,
    });
  }

  async trackUsage(event: Omit<UsageEvent, 'sessionId' | 'andorVersion'>): Promise<void> {
    if (!this.isEnabled) return;

    this.supabase.insert('usage_patterns', {
      session_id:      this.sessionId,
      event_type:      event.eventType,
      task_type:       event.taskType,
      language:        event.language,
      framework:       event.framework,
      model_used:      event.modelUsed,
      provider:        event.provider,
      files_count:     event.filesCount,
      commands_count:  event.commandsCount,
      duration_ms:     event.durationMs,
      success:         event.success,
      andor_version:   ANDOR_VERSION,
    });
  }

  async trackErrorSolution(event: ErrorSolutionEvent): Promise<void> {
    if (!this.isEnabled) return;

    const sanitized = {
      ...event,
      errorPattern:  this.privacy.sanitizeErrorPattern(event.errorPattern),
      fixStrategy:   event.fixStrategy
        ? this.privacy.sanitizeErrorPattern(event.fixStrategy)
        : undefined,
    };

    this.supabase.insert('error_solutions', {
      error_pattern:    sanitized.errorPattern,
      error_code:       event.errorCode,
      error_source:     event.errorSource,
      language:         event.language,
      framework:        event.framework,
      fix_strategy:     sanitized.fixStrategy,
      model_used:       event.modelUsed,
      solution_accepted: event.solutionAccepted,
      attempts_needed:  event.attemptsNeeded,
    });
  }

  async getBestModel(
    taskType: TaskType,
    language: string = 'any',
    framework: string = 'any'
  ): Promise<ModelRecommendation | null> {
    const result = await this.supabase.rpc<ModelRecommendation[]>(
      'get_best_model',
      { p_task_type: taskType, p_language: language, p_framework: framework }
    );

    if (result && Array.isArray(result) && result.length > 0) {
      return {
        modelId:        result[0].modelId,
        provider:       result[0].provider as Provider,
        acceptanceRate: result[0].acceptanceRate,
        sampleCount:    result[0].sampleCount,
        confidence:     result[0].confidence,
        runnerUp:       result[0].runnerUp,
      };
    }

    return this.local.getBestModel(taskType, language, framework);
  }

  async getStats(): Promise<{
    totalFeedback: number;
    acceptanceRate: number;
    topModel: string;
  }> {
    return this.local.getStats();
  }

  /** Detect task type from user message */
  static detectTaskType(message: string): TaskType {
    const lower = message.toLowerCase();
    if (/\b(fix|bug|error|issue|broken|crash|fail|debug)\b/.test(lower)) return 'debug';
    if (/\b(refactor|clean|improve|optimize|simplify|reorganize)\b/.test(lower)) return 'refactor';
    if (/\b(create|add|build|implement|new|make|generate|write)\b/.test(lower)) return 'create';
    if (/\b(explain|what|how|why|understand|describe|tell me)\b/.test(lower)) return 'explain';
    if (/\b(test|spec|coverage|jest|mocha|pytest)\b/.test(lower)) return 'test';
    if (/\b(review|check|audit|inspect|look at|analyze)\b/.test(lower)) return 'review';
    return 'other';
  }
}
