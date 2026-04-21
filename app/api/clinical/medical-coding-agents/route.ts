import { NextResponse } from "next/server"
import { generateText } from "ai"
import { createClient } from "@/lib/supabase/server"
import { openproviders } from "@/lib/openproviders"
import { assertPracticeMember } from "@/lib/medikredit/practice-guard"

export const runtime = "nodejs"
export const maxDuration = 120

type ClaimItemOut = {
  lineNumber: number
  tp: 1 | 2 | 3
  tariffCode?: string
  nappiCode?: string
  icdCodes?: string[]
  grossAmount: number
  treatmentDate: string
  treatmentTime?: string
  modifierCode?: string
}

const SYSTEM = `You are a South African medical billing coding assistant. Extract claim line items for MediKredit (tariff procedures, modifiers, NAPPI medicines).
Return ONLY valid JSON: { "claimItems": ClaimItem[] } where each item has:
- lineNumber (1-based int)
- tp: 1 = medicine (NAPPI), 2 = procedure (tariff), 3 = modifier
- tariffCode: for procedures (e.g. 0190, 0191)
- nappiCode: for medicines when known
- icdCodes: string array (ICD-10 codes without dots optional)
- grossAmount: number in ZAR
- treatmentDate: YYYY-MM-DD
- treatmentTime: HH:mm optional
- modifierCode: only when tp=3
Use clinicalContent and appointment services. If information is missing, infer reasonable defaults for date (today) and amounts from context.`

function synthesizeFromAppointment(appointmentData: {
  resolvedServices?: { name?: string; code?: string; price?: number }[]
  eScriptMedications?: { nappi?: string; name?: string; quantity?: number; price?: number }[]
}): ClaimItemOut[] {
  const lines: ClaimItemOut[] = []
  let n = 1
  const today = new Date().toISOString().slice(0, 10)
  for (const s of appointmentData.resolvedServices ?? []) {
    lines.push({
      lineNumber: n++,
      tp: 2,
      tariffCode: s.code || "0190",
      icdCodes: ["Z00"],
      grossAmount: typeof s.price === "number" ? s.price : 420,
      treatmentDate: today,
    })
  }
  for (const m of appointmentData.eScriptMedications ?? []) {
    lines.push({
      lineNumber: n++,
      tp: 1,
      nappiCode: m.nappi,
      icdCodes: ["Z00"],
      grossAmount: typeof m.price === "number" ? m.price : 120,
      treatmentDate: today,
    })
  }
  return lines
}

export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
  }

  let body: {
    practiceId?: string
    clinicalContent?: string
    patientData?: Record<string, unknown>
    practiceData?: Record<string, unknown>
    mode?: string
    appointmentData?: {
      resolvedServices?: { name?: string; code?: string; price?: number }[]
      eScriptMedications?: { nappi?: string; name?: string; quantity?: number; price?: number }[]
    }
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const practiceId = body.practiceId?.trim()
  if (!practiceId) {
    return NextResponse.json({ error: "practiceId is required" }, { status: 400 })
  }

  try {
    await assertPracticeMember(practiceId)
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }

  const clinical = body.clinicalContent?.trim() ?? ""
  const appt = body.appointmentData ?? {}

  if (!clinical && (!appt.resolvedServices?.length && !appt.eScriptMedications?.length)) {
    return NextResponse.json(
      { error: "Provide clinicalContent and/or appointmentData with services or e-scripts" },
      { status: 400 }
    )
  }

  const userPayload = JSON.stringify({
    patientData: body.patientData,
    practiceData: body.practiceData,
    mode: body.mode ?? "claim",
    appointmentData: appt,
    clinicalContent: clinical.slice(0, 120_000),
  })

  try {
    const model = openproviders("gpt-4o-mini")
    const { text } = await generateText({
      model,
      system: SYSTEM,
      prompt: userPayload,
      temperature: 0.2,
    })
    const jsonMatch = /\{[\s\S]*"claimItems"[\s\S]*\}/.exec(text)
    const raw = jsonMatch ? jsonMatch[0] : text
    const parsed = JSON.parse(raw) as { claimItems?: ClaimItemOut[] }
    if (parsed.claimItems?.length) {
      return NextResponse.json({ claimItems: parsed.claimItems, source: "llm" })
    }
  } catch (e) {
    console.warn("[medical-coding-agents] LLM path failed:", e)
  }

  const fallback = synthesizeFromAppointment(appt)
  if (fallback.length) {
    return NextResponse.json({ claimItems: fallback, source: "fallback" })
  }

  return NextResponse.json(
    { error: "Could not produce claim lines. Add resolvedServices/eScriptMedications or fix clinical content." },
    { status: 422 }
  )
}
