import { openproviders } from "@/lib/openproviders"
import { ModelConfig } from "../types"

const grokModels: ModelConfig[] = [
  {
    id: "fleming-4",
    name: "Fleming 4",
    provider: "xAI",
    providerId: "xai",
    modelFamily: "Fleming",
    baseProviderId: "xai",
    description:
      "Default clinical flagship powered by Grok 4.1 Fast Reasoning for strong quality and reliable tool use.",
    tags: [
      "latest",
      "advanced",
      "reasoning",
      "conversational",
      "students",
      "professionals",
      "depth",
    ],
    useCases: [
      "Complex clinical reasoning",
      "Long-form medical synthesis",
      "Tool-heavy workflows",
    ],
    healthcareBenchmarks: [
      "MedQA-style reasoning: high",
      "Clinical guideline grounding: high",
      "Differential diagnosis structure: strong",
    ],
    verifiedBenchmarks: [
      {
        label: "Research-Eval Reka",
        value: "63.9",
        source: "xAI Grok 4.1 Fast release",
        sourceUrl: "https://x.ai/news/grok-4-1-fast",
      },
      {
        label: "FRAMES",
        value: "87.6",
        source: "xAI Grok 4.1 Fast release",
        sourceUrl: "https://x.ai/news/grok-4-1-fast",
      },
      {
        label: "Tau2-bench Telecom",
        value: "100%",
        source: "xAI Grok 4.1 Fast release",
        sourceUrl: "https://x.ai/news/grok-4-1-fast",
      },
    ],
    contextWindow: 2000000,
    inputCost: 0.2,
    outputCost: 0.5,
    priceUnit: "per 1M tokens",
    vision: true,
    tools: true,
    audio: false,
    reasoning: true,
    webSearch: true,
    openSource: false,
    speed: "Fast",
    intelligence: "High",
    website: "https://x.ai",
    apiDocs: "https://docs.x.ai/docs/models",
    modelPage: "https://x.ai/news/grok-4-1-fast",
    releasedAt: "2025-11-01",
    icon: "xai",
    accessible: true,
    apiSdk: (apiKey?: string, opts?: { enableSearch?: boolean }) =>
      openproviders(
        "grok-4-1-fast-reasoning",
        opts?.enableSearch ? ({ web_search: true } as any) : undefined,
        apiKey
      ),
  },
  {
    id: "grok-4-1-fast-reasoning",
    name: "Grok 4.1 Fast Reasoning",
    provider: "xAI",
    providerId: "xai",
    modelFamily: "Grok",
    baseProviderId: "xai",
    description:
      "Latest fast frontier Grok model with strong reasoning and very large context.",
    tags: ["latest", "reasoning", "fast", "tools", "vision"],
    useCases: ["General frontier chat", "Agentic tasks", "Large-context analysis"],
    healthcareBenchmarks: [
      "Medical knowledge recall: strong",
      "Triage reasoning consistency: high",
    ],
    verifiedBenchmarks: [
      {
        label: "Berkeley Function Calling v4",
        value: "72%",
        source: "xAI Grok 4.1 Fast release",
        sourceUrl: "https://x.ai/news/grok-4-1-fast",
      },
      {
        label: "Research-Eval Reka",
        value: "63.9",
        source: "xAI Grok 4.1 Fast release",
        sourceUrl: "https://x.ai/news/grok-4-1-fast",
      },
    ],
    contextWindow: 2000000,
    inputCost: 0.2,
    outputCost: 0.5,
    priceUnit: "per 1M tokens",
    vision: true,
    tools: true,
    audio: false,
    reasoning: true,
    webSearch: true,
    openSource: false,
    speed: "Fast",
    intelligence: "High",
    website: "https://x.ai",
    apiDocs: "https://docs.x.ai/docs/models",
    modelPage: "https://x.ai/news/grok-4-1-fast",
    releasedAt: "2025-11-01",
    icon: "xai",
    accessible: true,
    apiSdk: (apiKey?: string, opts?: { enableSearch?: boolean }) =>
      openproviders(
        "grok-4-1-fast-reasoning",
        opts?.enableSearch ? ({ web_search: true } as any) : undefined,
        apiKey
      ),
  },
]

export { grokModels }
