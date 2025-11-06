import { ModelConfig } from "../types"
import { createInflectionModel } from "@/lib/openproviders/inflection-adapter"
import { createFleming35Model } from "@/lib/openproviders/fleming-3.5-adapter"

const inflectionModels: ModelConfig[] = [
  {
    id: "pi-3.1",
    name: "Pi 3.1",
    provider: "Inflection AI",
    providerId: "inflection",
    modelFamily: "Pi",
    baseProviderId: "inflection",
    description:
      "Inflection AI's Pi 3.1 model - a conversational AI assistant optimized for helpful, harmless, and honest interactions.",
    tags: ["conversational", "assistant"],
    contextWindow: 128000,
    inputCost: 0,
    outputCost: 0,
    priceUnit: "per 1M tokens",
    vision: false,
    tools: false,
    audio: false,
    reasoning: false,
    openSource: false,
    speed: "Fast",
    intelligence: "High",
    website: "https://inflection.ai",
    apiDocs: "https://api.inflection.ai",
    modelPage: "https://inflection.ai/pi",
    releasedAt: "2024-01-01",
    icon: "inflection",
    apiSdk: (apiKey?: string, opts?: { enableSearch?: boolean }) => createInflectionModel("pi-3.1", apiKey),
  },
  {
    id: "fleming-3.5",
    name: "Fleming 3.5",
    provider: "Fleming",
    providerId: "inflection",
    modelFamily: "Fleming",
    baseProviderId: "inflection",
    description:
      "Conversational model for natural dialogue and quick queries.",
    tags: ["conversational", "assistant", "vision", "emotional-intelligence"],
    contextWindow: 128000,
    inputCost: 0,
    outputCost: 0,
    priceUnit: "per 1M tokens",
    vision: true, // Supports images via Grok
    tools: false,
    audio: false,
    reasoning: false,
    openSource: false,
    speed: "Fast",
    intelligence: "High",
    website: "https://inflection.ai",
    apiDocs: "https://api.inflection.ai",
    modelPage: "https://inflection.ai/pi",
    releasedAt: "2024-01-01",
    icon: "inflection",
    apiSdk: (apiKey?: string, opts?: { enableSearch?: boolean; grokApiKey?: string }) => {
      // Get Grok API key from opts (user keys) or environment variable as fallback
      const grokApiKey = opts?.grokApiKey || process.env.XAI_API_KEY || undefined
      return createFleming35Model(apiKey, grokApiKey)
    },
  },
]

export { inflectionModels }

