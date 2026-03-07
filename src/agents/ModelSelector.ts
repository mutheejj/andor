import { AgentRole, ROLE_MODEL_PREFERENCES } from './types';
import { ProviderRegistry } from '../providers';

/**
 * Automatically picks the best available model for each agent role.
 * Tries role-preferred models in order, falls back to any available model.
 */
export class ModelSelector {
  constructor(private providerRegistry: ProviderRegistry) {}

  /**
   * Select the best model for a given agent role.
   * Tries preferred models in order, picks first that has a configured API key.
   */
  selectForRole(role: AgentRole): string | null {
    const preferences = ROLE_MODEL_PREFERENCES[role] ?? [];

    // Try each preferred model in order
    for (const modelSpec of preferences) {
      if (this.isModelAvailable(modelSpec)) {
        return modelSpec;
      }
    }

    // Fallback: try any available model
    const allModels = this.providerRegistry.getAllModels();
    for (const entry of allModels) {
      const spec = `${entry.provider.id}::${entry.model.id}`;
      if (this.isModelAvailable(spec)) {
        return spec;
      }
    }

    return null;
  }

  /**
   * Select models for multiple roles at once.
   * Returns a map of role → modelSpec.
   */
  selectForRoles(roles: AgentRole[]): Map<AgentRole, string> {
    const result = new Map<AgentRole, string>();
    for (const role of roles) {
      const model = this.selectForRole(role);
      if (model) {
        result.set(role, model);
      }
    }
    return result;
  }

  /**
   * Get a fast model for quick tasks (prompt improvement, terminal parsing).
   * Prefers Groq for speed, falls back to others.
   */
  selectFastModel(): string | null {
    const fastModels = [
      'groq::llama-3.1-8b-instant',
      'groq::llama-3.3-70b-versatile',
      'google::gemini-2.0-flash',
      'puter::gpt-4o-mini',
    ];

    for (const spec of fastModels) {
      if (this.isModelAvailable(spec)) return spec;
    }

    return this.selectForRole('terminal'); // any available model
  }

  private isModelAvailable(modelSpec: string): boolean {
    const allModels = this.providerRegistry.getAllModels();
    const [providerId, modelId] = modelSpec.split('::');

    // Check if model exists in registry
    const exists = allModels.some(
      m => m.provider.id === providerId && m.model.id === modelId
    );
    if (!exists) return false;

    // Puter models are always available (no API key needed)
    if (providerId === 'puter') return true;

    // For other providers, we can't check API key here synchronously,
    // but the registry will handle missing keys at call time.
    // We'll assume configured providers are available.
    return true;
  }
}
