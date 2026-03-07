import * as vscode from 'vscode';
import { FeedbackEvent, ModelRecommendation, TaskType, Provider } from './types';

interface LocalData {
  feedback: FeedbackEvent[];
  modelStats: Record<string, {
    total: number;
    accepted: number;
    taskTypes: Record<string, { total: number; accepted: number }>;
  }>;
  lastUpdated: number;
}

export class LocalLearning {
  private data: LocalData = {
    feedback: [],
    modelStats: {},
    lastUpdated: Date.now(),
  };

  constructor(private context: vscode.ExtensionContext) {
    const saved = context.globalState.get<LocalData>('andor.localLearning');
    if (saved) this.data = saved;
  }

  async saveFeedback(event: FeedbackEvent): Promise<void> {
    this.data.feedback.push(event);
    if (this.data.feedback.length > 500) {
      this.data.feedback = this.data.feedback.slice(-500);
    }

    if (!this.data.modelStats[event.modelId]) {
      this.data.modelStats[event.modelId] = {
        total: 0, accepted: 0, taskTypes: {}
      };
    }

    const stats = this.data.modelStats[event.modelId];
    stats.total++;
    if (event.accepted) stats.accepted++;

    const taskKey = event.taskType;
    if (!stats.taskTypes[taskKey]) {
      stats.taskTypes[taskKey] = { total: 0, accepted: 0 };
    }
    stats.taskTypes[taskKey].total++;
    if (event.accepted) stats.taskTypes[taskKey].accepted++;

    this.data.lastUpdated = Date.now();
    await this.context.globalState.update('andor.localLearning', this.data);
  }

  getBestModel(
    taskType: TaskType,
    _language: string,
    _framework: string
  ): ModelRecommendation | null {
    let best: ModelRecommendation | null = null;
    let bestRate = 0;

    for (const [modelId, stats] of Object.entries(this.data.modelStats)) {
      const taskStats = stats.taskTypes[taskType];
      if (!taskStats || taskStats.total < 3) continue;

      const rate = taskStats.accepted / taskStats.total;
      if (rate > bestRate) {
        bestRate = rate;
        best = {
          modelId,
          provider: 'puter' as Provider,
          acceptanceRate: rate,
          sampleCount: taskStats.total,
          confidence: taskStats.total >= 20 ? 'medium' : 'low',
        };
      }
    }

    return best;
  }

  getStats(): { totalFeedback: number; acceptanceRate: number; topModel: string } {
    const total = this.data.feedback.length;
    const accepted = this.data.feedback.filter(f => f.accepted).length;

    let topModel = 'none';
    let topRate = 0;
    for (const [modelId, stats] of Object.entries(this.data.modelStats)) {
      if (stats.total < 5) continue;
      const rate = stats.accepted / stats.total;
      if (rate > topRate) { topRate = rate; topModel = modelId; }
    }

    return {
      totalFeedback: total,
      acceptanceRate: total > 0 ? accepted / total : 0,
      topModel,
    };
  }
}
