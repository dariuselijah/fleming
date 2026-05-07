import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { createAdminClient } from "@/lib/supabase/admin"

export const BRAND_COLORS = {
  emerald: { r: 0.0, g: 0.78, b: 0.48 },
  ink: { r: 0.05, g: 0.07, b: 0.08 },
  muted: { r: 0.42, g: 0.45, b: 0.48 },
  line: { r: 0.88, g: 0.9, b: 0.91 },
  wash: { r: 0.96, g: 0.98, b: 0.97 },
}

export async function loadFlemingLogoBytes(): Promise<Uint8Array | null> {
  for (const file of ["logo.png", "fleming-logo.png"]) {
    try {
      const bytes = await readFile(join(process.cwd(), "public", file))
      return new Uint8Array(bytes)
    } catch {
      // Optional branding asset.
    }
  }
  return null
}

export async function loadPracticeLogoBytes(storagePath?: string | null): Promise<Uint8Array | null> {
  if (!storagePath) return null
  try {
    const { data, error } = await createAdminClient().storage.from("practice-branding").download(storagePath)
    if (error || !data) return null
    return new Uint8Array(await data.arrayBuffer())
  } catch {
    return null
  }
}
