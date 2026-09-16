/** OpenAI reasoning / GPT-5 family models only support the default temperature (1). */
const FIXED_TEMPERATURE_MODEL_PATTERN = /^(gpt-5(?:\.|$|-)|o\d(?:-|$|-))/i

export function modelRequiresDefaultTemperature(modelId: string): boolean {
  return FIXED_TEMPERATURE_MODEL_PATTERN.test(modelId.trim())
}

/** Settings safe to spread into streamText / generateText / generateObject. */
export function llmCallSettingsForModel(
  modelId: string,
  preferredTemperature = 0
): { temperature?: number } {
  if (modelRequiresDefaultTemperature(modelId)) {
    return { temperature: 1 }
  }
  return { temperature: preferredTemperature }
}

export function supportsZeroTemperature(modelId: string): boolean {
  return !modelRequiresDefaultTemperature(modelId)
}
