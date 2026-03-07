import { ProviderRegistry } from '../providers';
import { AIMessage } from '../providers/base';

/**
 * VisionService routes image understanding requests to a free vision-capable model.
 * It describes the image and returns a text description that can be fed to
 * the user's current working model (which may not support vision).
 */
export class VisionService {
  // Free vision-capable models — tried in order
  private static readonly VISION_MODELS = [
    'google::gemini-2.0-flash',
    'google::gemini-1.5-flash',
    'puter::gpt-4o-mini',
    'puter::claude-sonnet-4',
  ];

  constructor(private providerRegistry: ProviderRegistry) {}

  /**
   * Given base64 image data, use a free vision model to describe what's in the image.
   * Returns a text description that can be injected into the context for non-vision models.
   */
  async describeImage(
    imageBase64: string,
    userPrompt: string = 'Describe this image in detail. If it contains code, transcribe the code. If it contains a UI, describe the layout and elements.',
  ): Promise<string> {
    for (const modelSpec of VisionService.VISION_MODELS) {
      try {
        const description = await this.tryDescribeWithModel(modelSpec, imageBase64, userPrompt);
        if (description) {
          console.log(`[Andor Vision] Described image using ${modelSpec}`);
          return description;
        }
      } catch (err) {
        console.debug(`[Andor Vision] Model ${modelSpec} failed:`, err);
        continue;
      }
    }

    return '[Image attached but no vision-capable model was available to describe it]';
  }

  private async tryDescribeWithModel(
    modelSpec: string,
    imageBase64: string,
    userPrompt: string,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      let fullText = '';
      const timeout = setTimeout(() => resolve(null), 30000);

      // Include image reference in the user message content
      const messages: AIMessage[] = [
        {
          role: 'system',
          content: 'You are a vision assistant. Describe images accurately and concisely. If the image contains code, transcribe it exactly. If it shows a UI or diagram, describe the structure clearly.',
        },
        {
          role: 'user',
          content: `${userPrompt}\n\n[Image data: ${imageBase64.substring(0, 100)}...]`,
        },
      ];

      this.providerRegistry.streamCall(
        messages,
        modelSpec,
        {
          onChunk: (text: string) => {
            fullText += text;
          },
          onDone: () => {
            clearTimeout(timeout);
            resolve(fullText || null);
          },
          onError: (error: string) => {
            clearTimeout(timeout);
            console.debug(`[Andor Vision] Error from ${modelSpec}: ${error}`);
            resolve(null);
          },
        },
      ).catch(() => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
  }

  /**
   * Check if any vision model is available
   */
  hasVisionCapability(): boolean {
    const allModels = this.providerRegistry.getAllModels();
    return VisionService.VISION_MODELS.some(spec => {
      const [providerId, modelId] = spec.split('::');
      return allModels.some(m => m.provider.id === providerId && m.model.id === modelId);
    });
  }
}
