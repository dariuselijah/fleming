import type { SupportedModel } from "@/lib/openproviders/types"
import { getModelInfo } from "@/lib/models"

/** Detect clinical slash-command artifact generation (fast path: no RAG, no evidence). */
export function isClinicalArtifactCommand(queryText: string): boolean {
  return /^\[\/(soap|icd|claim|summary|prescribe|refer|evidence)\]/i.test(queryText.trim())
}

const DEFAULT_ARTIFACT_MODEL: SupportedModel = "gpt-5.5"

function resolveClinicalArtifactModel(): SupportedModel {
  const raw = process.env.CLINICAL_ARTIFACT_MODEL
  if (raw && getModelInfo(raw)) return raw as SupportedModel
  return DEFAULT_ARTIFACT_MODEL
}

export const CLINICAL_ARTIFACT_MODEL = resolveClinicalArtifactModel()
