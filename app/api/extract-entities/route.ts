import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateText } from "ai"
import { openproviders } from "@/lib/openproviders"

const EXTRACTION_PROMPT = `You are an expert medical scribe performing structured clinical extraction from a consultation transcript. Think like a clinician — extract what matters for documentation, diagnosis, and patient safety.

Return ONLY valid JSON with two keys: "entities" and "highlights".

─── ENTITIES ───

{
  "chief_complaint": [
    "One phrase: laterality + site + nature + duration. E.g. 'Painful erythematous rash on right ankle, worsening over 2 weeks, with purulent drainage'"
  ],
  "symptoms": [
    "Only POSITIVE findings — symptoms the patient IS experiencing.",
    "Use qualified clinical phrases with OPQRST where available: Onset, Provocation/Palliation, Quality, Region/Radiation, Severity, Timing",
    "E.g. 'Sharp anterior chest pain, 6/10, worse with coughing and lying down, improved leaning forward, intermittent episodes lasting seconds, onset 3 days ago, radiates to neck'",
    "Include functional impact: 'pain worse with ambulation, better at rest'",
    "DO NOT list individual pertinent negatives as separate items. Instead, add ONE summary line at the end: 'ROS otherwise negative (denies SOB, dizziness, palpitations, N/V, fever/chills)'"
  ],
  "diagnoses": [
    "ALL conditions mentioned — both ACTIVE and HISTORICAL",
    "Mark historical/resolved conditions: 'childhood asthma (resolved)'",
    "Include suspected/working diagnoses: 'possible cellulitis (under evaluation)'",
    "Include lab values that define severity: 'type 2 diabetes, poorly controlled (A1C ~9)'",
    "E.g. 'chronic back pain (10 years)', 'high cholesterol (on statin)'"
  ],
  "medications": [
    "Every medication mentioned with dose/frequency if stated",
    "Include PRN medications: 'Tylenol PRN for back pain', 'Advil PRN'",
    "If patient states a COUNT but can't name all, note it: '2 additional diabetes medications (names unknown)'",
    "Include insulin status if discussed: 'not on insulin'"
  ],
  "allergies": [
    "Drug name — reaction type and severity",
    "E.g. 'Penicillin — facial angioedema, respiratory distress (anaphylactoid)'",
    "If patient denies allergies: 'NKDA'"
  ],
  "vitals": [
    "Any vital signs WITH values mentioned: 'BP 130/85 mmHg', 'HR 92 bpm', 'Temp 38.2°C'",
    "Include subjective: 'patient reports feeling febrile (no thermometer at home)'"
  ],
  "procedures": [
    "Past surgeries WITH context: 'sinus surgery for chronic sinusitis (teens)'",
    "Current/planned tests: 'physical examination of right leg pending'",
    "Include imaging, labs ordered or mentioned"
  ],
  "social_history": [
    "Be SPECIFIC with quantities and patterns:",
    "Smoking: 'smokes ~2 packs/week, increased recently due to stress'",
    "Alcohol: 'drinks ~24 beers/week, primarily on weekends'",
    "Drugs: name each substance or 'denies recreational drug use'",
    "Employment: 'self-employed accountant, currently partially unemployed'",
    "Living: 'lives alone in town, children every 2 weeks'",
    "Self-care: 'poor diabetes self-management, stopped monitoring glucose'"
  ],
  "family_history": [
    "Distinguish maternal vs paternal lineage:",
    "E.g. 'Maternal: diabetes, hypertension, hypercholesterolemia (widespread)'",
    "E.g. 'Paternal aunt: lung cancer (heavy smoker); father's side otherwise healthy'"
  ],
  "risk_factors": [
    "SYNTHESIZE clinical risk — don't just echo diagnoses. Reason about what puts this patient at risk:",
    "E.g. 'Poorly controlled diabetes (A1C ~9) with non-compliance — increased infection risk'",
    "E.g. 'Peripheral neuropathy with reduced foot sensation — delayed wound detection'",
    "E.g. 'Active ulcer on contralateral (left) heel — systemic wound-healing impairment'",
    "E.g. 'Smoking + diabetes — synergistic vascular risk'"
  ]
}

─── HIGHLIGHTS ───

Array of {"text": "...", "type": "..."} for inline transcript annotation.

"text" must be an EXACT verbatim substring from the transcript (case-insensitive match).
"type" is one of: "symptom", "diagnosis", "medication", "vital", "procedure", "history"

HIGHLIGHT RULES:
1. Only highlight PATIENT STATEMENTS that contain clinical information, NOT clinician questions
2. Prefer the LONGEST meaningful phrase: "sharp pain in my chest" not "pain"
3. For diagnoses: "I've got diabetes" — highlight "I've got diabetes"
4. For history: "two packs a week" — highlight "two packs a week"
5. For symptoms: "it's red, turning more red in the area around it" — highlight the whole descriptive phrase
6. For meds: "Resuvastatin" — highlight the drug name
7. For allergies: "Penicillin, can't take that" — highlight it
8. For vitals: "my A1C last time was like nine" — highlight it
9. Do NOT highlight the same entity more than twice. Prioritize the most descriptive occurrence.
10. Do NOT highlight single common words (pain, hot, tired) unless they appear in a qualifying phrase
11. Maximum 40 highlights for a full consultation.

Return ONLY the JSON object. No markdown fences, no commentary.`

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

    const model = openproviders("gpt-5.2")

    const result = await generateText({
      model,
      system: EXTRACTION_PROMPT,
      prompt: transcript.slice(0, 16000),
      temperature: 0,
    })

    let parsed: { entities: Record<string, string[]>; highlights: { text: string; type: string }[] }
    try {
      const cleaned = result.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({
        error: "Failed to parse extraction",
        raw: result.text,
      }, { status: 500 })
    }

    return NextResponse.json({
      entities: parsed.entities ?? {},
      highlights: parsed.highlights ?? [],
    })
  } catch (error) {
    console.error("[extract-entities] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extraction failed" },
      { status: 500 }
    )
  }
}
