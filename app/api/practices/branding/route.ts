import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

/** Practice-facing invoice header fields (no secrets). */
export async function GET() {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [{ data: pRaw }, { data: bs }, { data: mk }] = await Promise.all([
    ctx.supabase.from("practices").select("name, country_code, logo_storage_path, address, phone, hpcsa_number, bhf_number").eq("id", ctx.practiceId).maybeSingle(),
    ctx.supabase.from("practice_billing_settings").select("provider_name").eq("practice_id", ctx.practiceId).maybeSingle(),
    ctx.supabase
      .from("medikredit_providers")
      .select("bhf_number, hpc_number, provider_display_name")
      .eq("practice_id", ctx.practiceId)
      .maybeSingle(),
  ])
  const p = pRaw as {
    name?: string
    country_code?: string
    logo_storage_path?: string | null
    address?: string | null
    phone?: string | null
    hpcsa_number?: string | null
    bhf_number?: string | null
  } | null

  const practiceName = (p?.name as string)?.trim() || "Practice"
  const tradingName = (bs?.provider_name as string)?.trim() || practiceName
  const address =
    (p?.address as string)?.trim() ||
    (p?.country_code ? `Country: ${p.country_code}` : undefined)

  let logoUrl = "/logo-white.png"
  const logoPath = p?.logo_storage_path
  if (logoPath) {
    const { data: signed } = await ctx.supabase.storage
      .from("practice-branding")
      .createSignedUrl(logoPath, 3600)
    if (signed?.signedUrl) logoUrl = signed.signedUrl
  }

  return NextResponse.json({
    practiceName,
    tradingName,
    displayName: mk?.provider_display_name ? String(mk.provider_display_name).trim() : tradingName,
    address,
    phone: (p?.phone as string)?.trim() || undefined,
    bhfNumber: mk?.bhf_number ? String(mk.bhf_number) : (p?.bhf_number ? String(p.bhf_number) : undefined),
    hpcsaNumber: mk?.hpc_number ? String(mk.hpc_number) : (p?.hpcsa_number ? String(p.hpcsa_number) : undefined),
    countryCode: p?.country_code ? String(p.country_code) : undefined,
    logoUrl,
  })
}
