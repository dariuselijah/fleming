import type { Database } from "@/app/types/database.types"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { MedikreditProviderSettings } from "./types"

type ProviderRow = Database["public"]["Tables"]["medikredit_providers"]["Row"]

export function rowToSettings(row: ProviderRow | null): MedikreditProviderSettings {
  if (!row) {
    return {
      useTestProvider: false,
      extraSettings: {},
    }
  }
  return {
    vendorId: row.vendor_id,
    bhfNumber: row.bhf_number,
    hpcNumber: row.hpc_number,
    groupPracticeNumber: row.group_practice_number,
    pcNumber: row.pc_number,
    worksNumber: row.works_number,
    prescriberMemAccNbr: row.prescriber_mem_acc_nbr,
    discipline: (row as Record<string, unknown>).discipline as string | null ?? null,
    useTestProvider: row.use_test_provider,
    extraSettings: (row.extra_settings as Record<string, unknown>) ?? {},
  }
}

export async function fetchMedikreditProviderSettings(
  supabase: SupabaseClient<Database>,
  practiceId: string
): Promise<MedikreditProviderSettings> {
  const { data } = await supabase.from("medikredit_providers").select("*").eq("practice_id", practiceId).maybeSingle()
  return rowToSettings(data)
}
