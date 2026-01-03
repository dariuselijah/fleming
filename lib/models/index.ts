import { FREE_MODELS_IDS } from "../config"
import { claudeModels } from "./data/claude"
import { deepseekModels } from "./data/deepseek"
import { geminiModels } from "./data/gemini"
import { grokModels } from "./data/grok"
import { grokAdditionalModels } from "./data/inflection"
import { mistralModels } from "./data/mistral"
import { openaiModels } from "./data/openai"
import { openrouterModels } from "./data/openrouter"
import { perplexityModels } from "./data/perplexity"
import { ModelConfig } from "./types"

// Static models (always available) - OLLAMA REMOVED for instant streaming
const STATIC_MODELS: ModelConfig[] = [
  ...openaiModels,
  ...mistralModels,
  ...deepseekModels,
  ...claudeModels,
  ...grokModels,
  ...grokAdditionalModels, // Additional Grok-based models (Fleming 3.5 removed)
  ...perplexityModels,
  ...geminiModels,
  ...openrouterModels,
]

// INSTANT MODEL LOADING - no dynamic loading, no delays
export async function getAllModels(): Promise<ModelConfig[]> {
  // Return static models immediately - no async operations
  return STATIC_MODELS
}

export async function getModelsWithAccessFlags(): Promise<ModelConfig[]> {
  const models = STATIC_MODELS

  const freeModels = models
    .filter(
      (model) =>
        FREE_MODELS_IDS.includes(model.id)
        // OLLAMA REMOVED - no more free Ollama models
    )
    .map((model) => ({
      ...model,
      accessible: true,
    }))

  const proModels = models
    .filter((model) => !freeModels.map((m) => m.id).includes(model.id))
    .map((model) => ({
      ...model,
      accessible: false,
    }))

  return [...freeModels, ...proModels]
}

export async function getModelsForProvider(
  provider: string
): Promise<ModelConfig[]> {
  const models = STATIC_MODELS

  const providerModels = models
    .filter((model) => model.providerId === provider)
    .map((model) => ({
      ...model,
      accessible: true,
    }))

  return providerModels
}

// Function to get models based on user's available providers
export async function getModelsForUserProviders(
  providers: string[]
): Promise<ModelConfig[]> {
  const providerModels = await Promise.all(
    providers.map((provider) => getModelsForProvider(provider))
  )

  const flatProviderModels = providerModels.flat()

  return flatProviderModels
}

// Synchronous function to get model info for simple lookups
// This uses static models for instant access
export function getModelInfo(modelId: string): ModelConfig | undefined {
  // Return from static models immediately - no async operations
  return STATIC_MODELS.find((model) => model.id === modelId)
}

// For backward compatibility - static models only
export const MODELS: ModelConfig[] = STATIC_MODELS

// No more cache refresh needed - models are static
export function refreshModelsCache(): void {
  // No-op - models are static
}
