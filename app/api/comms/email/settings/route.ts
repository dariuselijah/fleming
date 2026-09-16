import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { slugifyPracticeName } from "@/lib/practice/slugify"

export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("practice_members")
    .select("practice_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) return NextResponse.json({ enabled: false })

  const db = createAdminClient()
  const { data: settings } = await db
    .from("practice_email_settings")
    .select("inbound_slug, reply_from_email, enabled")
    .eq("practice_id", membership.practice_id)
    .maybeSingle()

  const domain = process.env.RESEND_INBOUND_DOMAIN?.trim() || "mail.fleming.app"
  const slug = settings?.inbound_slug ?? null
  const inboundAddress = slug ? `frontdesk+${slug}@${domain}` : null

  return NextResponse.json({
    enabled: Boolean(settings?.enabled),
    inboundSlug: slug,
    inboundAddress,
    replyFromEmail: settings?.reply_from_email ?? null,
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("practice_members")
    .select("practice_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: "No practice" }, { status: 403 })

  let body: { enable?: boolean }
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const db = createAdminClient()
  const { data: practice } = await db
    .from("practices")
    .select("name")
    .eq("id", membership.practice_id)
    .maybeSingle()

  const baseName = (practice?.name as string) || "practice"
  const slug = slugifyPracticeName(baseName)

  const domain = process.env.RESEND_INBOUND_DOMAIN?.trim() || "mail.fleming.app"
  const inboundAddress = `frontdesk+${slug}@${domain}`

  const { error } = await db.from("practice_email_settings").upsert(
    {
      practice_id: membership.practice_id,
      inbound_slug: slug,
      enabled: body.enable !== false,
      reply_from_email: inboundAddress,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "practice_id" }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, inboundAddress, inboundSlug: slug, enabled: body.enable !== false })
}
