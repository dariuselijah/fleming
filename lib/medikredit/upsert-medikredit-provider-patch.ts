import type { Database } from "@/app/types/database.types"
import type { SupabaseClient } from "@supabase/supabase-js"

function extrasRecord(row: Database["public"]["Tables"]["medikredit_providers"]["Row"] | null): Record<string, unknown> {
  const e = row?.extra_settings
  return e && typeof e === "object" && !Array.isArray(e) ? { ...(e as Record<string, unknown>) } : {}
}

/** Medprax discipline — also stored under `extra_settings.discipline` so saves work when the DB has not run migration `20260410140000` yet. */
function resolveDiscipline(
  row: Database["public"]["Tables"]["medikredit_providers"]["Row"] | null,
  patch: Partial<Database["public"]["Tables"]["medikredit_providers"]["Insert"]>,
  mergedExtras: Record<string, unknown>
): string | null {
  if (patch.discipline !== undefined) return patch.discipline
  if (row?.discipline != null && row.discipline !== "") return row.discipline
  const fromJson = mergedExtras.discipline
  return typeof fromJson === "string" ? fromJson : null
}

function buildMerged(
  row: Database["public"]["Tables"]["medikredit_providers"]["Row"] | null,
  patch: Partial<Database["public"]["Tables"]["medikredit_providers"]["Insert"]>,
  practiceId: string
): Database["public"]["Tables"]["medikredit_providers"]["Insert"] {
  const baseExtras = extrasRecord(row)
  const patchExtras =
    patch.extra_settings !== undefined && typeof patch.extra_settings === "object" && !Array.isArray(patch.extra_settings)
      ? { ...(patch.extra_settings as Record<string, unknown>) }
      : {}
  const mergedExtras: Record<string, unknown> = { ...baseExtras, ...patchExtras }
  const discipline = resolveDiscipline(row, patch, mergedExtras)
  mergedExtras.discipline = discipline

  return {
    practice_id: practiceId,
    provider_display_name:
      patch.provider_display_name !== undefined
        ? patch.provider_display_name
        : row?.provider_display_name ?? null,
    vendor_id: patch.vendor_id !== undefined ? patch.vendor_id : row?.vendor_id ?? null,
    bhf_number: patch.bhf_number !== undefined ? patch.bhf_number : row?.bhf_number ?? null,
    hpc_number: patch.hpc_number !== undefined ? patch.hpc_number : row?.hpc_number ?? null,
    group_practice_number:
      patch.group_practice_number !== undefined ? patch.group_practice_number : row?.group_practice_number ?? null,
    pc_number: patch.pc_number !== undefined ? patch.pc_number : row?.pc_number ?? null,
    works_number: patch.works_number !== undefined ? patch.works_number : row?.works_number ?? null,
    prescriber_mem_acc_nbr:
      patch.prescriber_mem_acc_nbr !== undefined ? patch.prescriber_mem_acc_nbr : row?.prescriber_mem_acc_nbr ?? null,
    vendor_version: patch.vendor_version !== undefined ? patch.vendor_version : row?.vendor_version ?? "1",
    use_test_provider:
      patch.use_test_provider !== undefined ? patch.use_test_provider : row?.use_test_provider ?? false,
    extra_settings:
      mergedExtras as Database["public"]["Tables"]["medikredit_providers"]["Insert"]["extra_settings"],
    updated_at: new Date().toISOString(),
  }
}

/** Merge into `medikredit_providers` without wiping columns omitted from `patch`. */
export async function upsertMedikreditProviderPatch(
  sb: SupabaseClient<Database>,
  practiceId: string,
  patch: Partial<Database["public"]["Tables"]["medikredit_providers"]["Insert"]>
) {
  const { data: row, error: readErr } = await sb
    .from("medikredit_providers")
    .select("*")
    .eq("practice_id", practiceId)
    .maybeSingle()

  if (readErr) {
    throw new Error(`[upsertMedikreditProviderPatch] read: ${readErr.message}`)
  }

  const merged = buildMerged(row, patch, practiceId)

  const updateBody: Database["public"]["Tables"]["medikredit_providers"]["Update"] = {
    provider_display_name: merged.provider_display_name,
    vendor_id: merged.vendor_id,
    bhf_number: merged.bhf_number,
    hpc_number: merged.hpc_number,
    group_practice_number: merged.group_practice_number,
    pc_number: merged.pc_number,
    works_number: merged.works_number,
    prescriber_mem_acc_nbr: merged.prescriber_mem_acc_nbr,
    vendor_version: merged.vendor_version,
    use_test_provider: merged.use_test_provider,
    extra_settings: merged.extra_settings,
    updated_at: merged.updated_at,
  }

  if (row) {
    const { error } = await sb.from("medikredit_providers").update(updateBody).eq("practice_id", practiceId)
    if (error) {
      throw new Error(`[upsertMedikreditProviderPatch] update: ${error.message}`)
    }
    return
  }

  const { error: insertErr } = await sb.from("medikredit_providers").insert(merged)
  if (insertErr) {
    // Row appeared between select and insert (rare) — retry as update.
    const dup =
      insertErr.code === "23505" ||
      insertErr.message?.toLowerCase().includes("duplicate") ||
      insertErr.message?.toLowerCase().includes("unique")
    if (dup) {
      const { error: retryErr } = await sb.from("medikredit_providers").update(updateBody).eq("practice_id", practiceId)
      if (retryErr) {
        throw new Error(`[upsertMedikreditProviderPatch] update after conflict: ${retryErr.message}`)
      }
      return
    }
    throw new Error(`[upsertMedikreditProviderPatch] insert: ${insertErr.message}`)
  }
}
