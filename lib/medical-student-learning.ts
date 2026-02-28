export const MEDICAL_STUDENT_LEARNING_MODES = [
  "ask",
  "simulate",
  "guideline",
] as const

export type MedicalStudentLearningMode =
  (typeof MEDICAL_STUDENT_LEARNING_MODES)[number]

export const DEFAULT_MEDICAL_STUDENT_LEARNING_MODE: MedicalStudentLearningMode =
  "ask"

export function normalizeMedicalStudentLearningMode(
  value: string | null | undefined
): MedicalStudentLearningMode {
  if (!value) return DEFAULT_MEDICAL_STUDENT_LEARNING_MODE
  if (
    (MEDICAL_STUDENT_LEARNING_MODES as readonly string[]).includes(value)
  ) {
    return value as MedicalStudentLearningMode
  }
  return DEFAULT_MEDICAL_STUDENT_LEARNING_MODE
}

type SimulationLearningCard = {
  type: "simulation"
  title: string
  caseStem: string
  vitalsLabs: string
  decisionCheckpoint: string
  immediateFeedback: string
  nextBranch: string
}

type GuidelineLearningCard = {
  type: "guideline"
  title: string
  recommendation: string
  evidenceStrength: string
  source: string
  region: string
  applyToCase: string
}

export type LearningCardData = SimulationLearningCard | GuidelineLearningCard

const LEARNING_CARD_PATTERN =
  /<learning-card>\s*([\s\S]*?)\s*<\/learning-card>/i

export function parseLearningCard(rawContent: string): {
  card: LearningCardData | null
  cleanContent: string
} {
  const match = rawContent.match(LEARNING_CARD_PATTERN)
  if (!match) {
    return { card: null, cleanContent: rawContent }
  }

  const cleanContent = rawContent
    .replace(LEARNING_CARD_PATTERN, "")
    .replace(/^\s+/, "")

  try {
    const parsed = JSON.parse(match[1]) as LearningCardData
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return { card: null, cleanContent }
    }

    if (parsed.type === "simulation") {
      return {
        card: {
          type: "simulation",
          title: parsed.title || "Clinical Simulation",
          caseStem: parsed.caseStem || "",
          vitalsLabs: parsed.vitalsLabs || "",
          decisionCheckpoint: parsed.decisionCheckpoint || "",
          immediateFeedback: parsed.immediateFeedback || "",
          nextBranch: parsed.nextBranch || "",
        },
        cleanContent,
      }
    }

    if (parsed.type === "guideline") {
      return {
        card: {
          type: "guideline",
          title: parsed.title || "Guideline Snapshot",
          recommendation: parsed.recommendation || "",
          evidenceStrength: parsed.evidenceStrength || "",
          source: parsed.source || "",
          region: parsed.region || "",
          applyToCase: parsed.applyToCase || "",
        },
        cleanContent,
      }
    }
  } catch {
    return { card: null, cleanContent }
  }

  return { card: null, cleanContent }
}

export function getLearningModeSystemInstructions(
  mode: MedicalStudentLearningMode
): string {
  if (mode === "simulate") {
    return `
MEDICAL STUDENT LEARNING MODE: SIMULATE

You are running an interactive clinical simulation.
- Start your response with ONE machine-readable card block in this exact format:
<learning-card>{"type":"simulation","title":"...","caseStem":"...","vitalsLabs":"...","decisionCheckpoint":"...","immediateFeedback":"...","nextBranch":"..."}</learning-card>
- Keep each card field concise (1-2 sentences max).
- After the card block, continue with concise coaching and ask one focused next-step question.
- Emphasize clinical reasoning over memorization.
`.trim()
  }

  if (mode === "guideline") {
    return `
MEDICAL STUDENT LEARNING MODE: GUIDELINE

You are in guideline navigator mode.
- Start your response with ONE machine-readable card block in this exact format:
<learning-card>{"type":"guideline","title":"...","recommendation":"...","evidenceStrength":"...","source":"...","region":"...","applyToCase":"..."}</learning-card>
- Keep fields concise and practical.
- Prefer current guideline-backed recommendations and include confidence/uncertainty when evidence is mixed.
- After the card block, provide brief rationale and key application caveats.
`.trim()
  }

  return `
MEDICAL STUDENT LEARNING MODE: ASK

Use a normal educational mentor style. Do not emit a <learning-card> block unless the user asks for a simulation or a guideline snapshot.
`.trim()
}
