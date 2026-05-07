import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  parsePracticeKnowledgeFromText,
  normalizeTime,
  type ParsedPracticeHour,
} from "@/lib/comms/practice-knowledge-parser"
import { extractTextFromUpload } from "@/lib/comms/practice-knowledge-text"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Unavailable" }, { status: 500 })
    }

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: membership } = await supabase
      .from("practice_members")
      .select("practice_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: "No practice" }, { status: 403 })
    }

    const practiceId = membership.practice_id
    const role = membership.role

    let rawText = ""
    let apply = false

    const ct = req.headers.get("content-type") || ""
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData()
      const textField = form.get("text")
      if (typeof textField === "string" && textField.trim()) {
        rawText = textField.trim()
      }
      const applyField = form.get("apply")
      apply = applyField === "true" || applyField === "on"
      const file = form.get("file")
      if (file instanceof File && file.size > 0) {
        const buf = Buffer.from(await file.arrayBuffer())
        const extracted = await extractTextFromUpload(
          buf,
          file.type || "application/octet-stream",
          file.name || "upload"
        )
        rawText = [rawText, extracted].filter(Boolean).join("\n\n---\n\n")
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        text?: string
        apply?: boolean
      }
      rawText = String(body.text || "").trim()
      apply = Boolean(body.apply)
    }

    if (rawText.length < 15) {
      return NextResponse.json(
        { error: "Add more text or upload a document (at least a short paragraph)." },
        { status: 400 }
      )
    }

    const parsed = await parsePracticeKnowledgeFromText(rawText)

    if (!apply) {
      return NextResponse.json({ preview: parsed })
    }

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json({ error: "Requires owner or admin role" }, { status: 403 })
    }

    const db = createAdminClient()

    if (parsed.hours.length > 0) {
      const { data: existing } = await db
        .from("practice_hours")
        .select("day_of_week, open_time, close_time, is_closed")
        .eq("practice_id", practiceId)

      type Ex = {
        day_of_week: number
        open_time: string
        close_time: string
        is_closed: boolean
      }
      const existingMap = new Map<number, Ex>(
        (existing || []).map((r: Ex) => [r.day_of_week, r])
      )
      const parsedMap = new Map<number, ParsedPracticeHour>(
        parsed.hours.map((h) => [h.day_of_week, h])
      )

      const rows = []
      for (let d = 0; d <= 6; d++) {
        const p = parsedMap.get(d)
        const ex = existingMap.get(d)
        if (p) {
          rows.push({
            practice_id: practiceId,
            day_of_week: d,
            open_time: normalizeTime(p.open_time),
            close_time: normalizeTime(p.close_time),
            is_closed: p.is_closed,
          })
        } else if (ex) {
          rows.push({
            practice_id: practiceId,
            day_of_week: d,
            open_time: ex.open_time,
            close_time: ex.close_time,
            is_closed: ex.is_closed,
          })
        } else {
          rows.push({
            practice_id: practiceId,
            day_of_week: d,
            open_time: "09:00",
            close_time: "17:00",
            is_closed: true,
          })
        }
      }

      const { error: upErr } = await db.from("practice_hours").upsert(rows, {
        onConflict: "practice_id,day_of_week",
      })
      if (upErr) {
        console.error("[practice-knowledge] hours upsert", upErr)
        return NextResponse.json({ error: upErr.message }, { status: 500 })
      }
    }

    if (parsed.faqs.length > 0) {
      const { error: delErr } = await db
        .from("practice_faqs")
        .delete()
        .eq("practice_id", practiceId)
      if (delErr) {
        console.error("[practice-knowledge] faq delete", delErr)
        return NextResponse.json({ error: delErr.message }, { status: 500 })
      }

      const inserts = parsed.faqs.map((f, i) => ({
        practice_id: practiceId,
        category: f.category,
        question: f.question,
        answer: f.answer,
        keywords: f.keywords,
        sort_order: i,
        active: true,
      }))

      const { error: insErr } = await db.from("practice_faqs").insert(inserts)
      if (insErr) {
        console.error("[practice-knowledge] faq insert", insErr)
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      ok: true,
      applied: {
        hours: parsed.hours.length > 0,
        faqs: parsed.faqs.length > 0,
      },
      preview: parsed,
    })
  } catch (e) {
    console.error("[practice-knowledge/ingest]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ingest failed" },
      { status: 500 }
    )
  }
}
