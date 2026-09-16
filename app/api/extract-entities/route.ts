import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateObject, NoObjectGeneratedError } from "ai"
import { openproviders } from "@/lib/openproviders"
import { llmCallSettingsForModel } from "@/lib/openproviders/model-temperature"
import { z } from "zod"
import { EMPTY_EXTRACTED, type EntityType } from "@/lib/scribe/entity-highlighter"

export const runtime = "nodejs"
export const maxDuration = 60

const EXTRACTION_MODEL =
  (process.env.EXTRACT_ENTITIES_MODEL as string) || "gpt-4o-mini"

const entityKeys = [
  "chief_complaint",
  "symptoms",
  "diagnoses",
  "medications",
  "allergies",
  "vitals",
  "procedures",
  "social_history",
  "family_history",
  "risk_factors",
] as const

type EntityKey = (typeof entityKeys)[number]

/** Loose schema for the model — caps applied in post-processing so over-generation never 500s. */
const extractionSchema = z.object({
  entities: z.object({
    chief_complaint: z.array(z.string()).default([]),
    symptoms: z.array(z.string()).default([]),
    diagnoses: z.array(z.string()).default([]),
    medications: z.array(z.string()).default([]),
    allergies: z.array(z.string()).default([]),
    vitals: z.array(z.string()).default([]),
    procedures: z.array(z.string()).default([]),
    social_history: z.array(z.string()).default([]),
    family_history: z.array(z.string()).default([]),
    risk_factors: z.array(z.string()).default([]),
  }),
  highlights: z
    .array(
      z.object({
        text: z.string(),
        /** Model may return entity bucket names — normalized to EntityType before response. */
        type: z.string(),
      })
    )
    .default([]),
})

const ENTITY_CAPS: Record<EntityKey, number> = {
  chief_complaint: 2,
  symptoms: 8,
  diagnoses: 5,
  medications: 8,
  allergies: 5,
  vitals: 6,
  procedures: 5,
  social_history: 4,
  family_history: 4,
  risk_factors: 5,
}

const HIGHLIGHT_TYPES_FOR_PROMPT =
  "symptom, diagnosis, medication, vital, procedure, history (use history for social/family/risk/allergy context)"

function normalizeHighlightType(raw: string): EntityType {
  const t = raw.trim().toLowerCase()
  if (t === "medication" || t === "medications") return "medication"
  if (t === "diagnosis" || t === "diagnoses") return "diagnosis"
  if (t === "vital" || t === "vitals") return "vital"
  if (t === "procedure" || t === "procedures") return "procedure"
  if (t === "symptom" || t === "symptoms" || t === "chief_complaint") return "symptom"
  if (t === "social_history" || t === "family_history" || t === "risk_factors") return "history"
  return "history"
}

function normalizeHighlights(
  items: Array<{ text: string; type: string }> | undefined
): Array<{ text: string; type: EntityType }> {
  if (!items?.length) return []
  const out: Array<{ text: string; type: EntityType }> = []
  const seen = new Set<string>()
  for (const h of items) {
    const text = h.text?.trim()
    if (!text || text.length < 2) continue
    const key = `${normalizeHighlightType(h.type)}:${text.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ text, type: normalizeHighlightType(h.type) })
    if (out.length >= 25) break
  }
  return out
}

const EXTRACTION_PROMPT = `Extract structured clinical entities and transcript highlights from a consultation transcript.

Entities: chief_complaint (one short phrase max), symptoms (positive findings only, max 8), diagnoses (max 5), medications (max 8), allergies, vitals, procedures, social_history, family_history, risk_factors.

Rules:
- Only include facts explicitly stated in the transcript. Do not infer or speculate.
- Deduplicate: one canonical phrase per concept; prefer clinician-stated terms.
- Keep each item under 80 characters; concise clinical language.
- Prefer the most clinically important items when many are mentioned.

Highlights: verbatim substrings from the transcript. Max 25. Prefer patient statements. Use highlight type: ${HIGHLIGHT_TYPES_FOR_PROMPT}.`

function dedupeEntityStrings(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const s = raw.trim()
    if (!s || s.length < 2) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    const dominated = out.some((existing) => {
      const el = existing.toLowerCase()
      return el.includes(key) && el.length > key.length + 4
    })
    if (dominated) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

function capEntityStrings(items: string[], max: number): string[] {
  return dedupeEntityStrings(items).slice(0, max)
}

function normalizeExtractedObject(raw: z.infer<typeof extractionSchema>) {
  const entities = { ...EMPTY_EXTRACTED }
  for (const key of entityKeys) {
    const items = raw.entities[key]
    if (Array.isArray(items) && items.length > 0) {
      entities[key] = capEntityStrings(
        items.filter((s) => typeof s === "string" && s.trim()),
        ENTITY_CAPS[key]
      )
    }
  }
  return {
    entities,
    highlights: normalizeHighlights(raw.highlights),
  }
}

function parseLooseExtractionJson(text: string): z.infer<typeof extractionSchema> | null {
  try {
    const parsed = JSON.parse(text) as unknown
    const result = extractionSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const transcript = body.transcript as string

    if (!transcript || transcript.trim().length < 20) {
      return NextResponse.json({ error: "Transcript too short" }, { status: 400 })
    }

    const model = openproviders(EXTRACTION_MODEL as never)

    let object: z.infer<typeof extractionSchema>
    try {
      const result = await generateObject({
        model,
        schema: extractionSchema,
        system: EXTRACTION_PROMPT,
        prompt: transcript.slice(0, 8000),
        ...llmCallSettingsForModel(EXTRACTION_MODEL, 0),
      })
      object = result.object
    } catch (genError) {
      if (genError instanceof NoObjectGeneratedError && genError.text) {
        const recovered = parseLooseExtractionJson(genError.text)
        if (recovered) {
          object = recovered
        } else {
          throw genError
        }
      } else {
        throw genError
      }
    }

    return NextResponse.json(normalizeExtractedObject(object))
  } catch (error) {
    console.error("[extract-entities] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extraction failed" },
      { status: 500 }
    )
  }
}
