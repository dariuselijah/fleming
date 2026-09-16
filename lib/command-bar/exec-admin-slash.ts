import type { AdminTab, WorkspaceMode } from "@/lib/clinical-workspace"

export type AdminSlashExtra = {
  /** Sends a user message into Ask Fleming (triggers tool use on the server). */
  submitAssistantPrompt?: (text: string) => void
  openAddPatientModal?: () => void
  openInventoryImport?: () => void
}

/** Deterministic /slash handling for the admin workspace + assistant bar. */
export function tryExecAdminSlashLine(
  line: string,
  ops: {
    setMode: (m: WorkspaceMode) => void
    setAdminTab: (t: AdminTab) => void
    requestInboxScrollTo: (target: "smart-import" | "messages" | "activity" | "labs") => void
  },
  extra?: AdminSlashExtra
): boolean {
  const t = line.trim()
  if (!t.startsWith("/")) return false
  const trigger = t.split(/\s+/)[0]?.toLowerCase() ?? ""

  const prompt = (msg: string) => {
    if (!extra?.submitAssistantPrompt) return false
    extra.submitAssistantPrompt(msg)
    return true
  }

  switch (trigger) {
    case "/bill":
    case "/billing":
      ops.setMode("admin")
      ops.setAdminTab("billing")
      return true
    case "/calendar":
      ops.setMode("admin")
      ops.setAdminTab("calendar")
      return true
    case "/inventory":
      ops.setMode("admin")
      ops.setAdminTab("inventory")
      return true
    case "/patients":
      ops.setMode("admin")
      ops.setAdminTab("patients")
      return true
    case "/inbox":
      ops.setMode("admin")
      ops.setAdminTab("front_desk")
      return true
    case "/scan":
    case "/scan-id":
    case "/scan-card":
      ops.setMode("admin")
      ops.setAdminTab("front_desk")
      ops.requestInboxScrollTo("smart-import")
      return true
    case "/clinical":
      ops.setMode("clinical")
      return true

    case "/eligibility":
      return prompt(
        "Run MediKredit eligibility for the attached patient using run_eligibility_check with their patient_id from context."
      )
    case "/famcheck":
    case "/family":
      return prompt(
        "Run a MediKredit family / dependant check for the attached patient using run_family_check with their patient_id from context."
      )
    case "/book":
    case "/slots":
      return prompt(
        "Find the next available appointment slots for the attached patient: use find_available_slots from today for 14 days, then I can pick a time."
      )
    case "/reminder":
      return prompt(
        "Send an SMS appointment reminder: find their next upcoming appointment with find_patient_appointments, then use send_appointment_reminder with that appointment id."
      )
    case "/invoice":
      ops.setMode("admin")
      ops.setAdminTab("billing")
      void prompt(
        "Help me create or open an invoice for the attached patient: use list_outstanding_invoices or create_invoice as appropriate."
      )
      return true
    case "/cash":
      return prompt("What is the cash drawer status? Use get_cash_drawer_status.")
    case "/statement":
      return prompt(
        "Generate a patient account statement: use generate_patient_statement for the attached patient if you have their patient_id."
      )
    case "/receipt":
      return prompt("Show how to send or record the last receipt for this patient (use billing tools as needed).")
    case "/addpatient":
      ops.setMode("admin")
      ops.setAdminTab("patients")
      extra?.openAddPatientModal?.()
      return true
    case "/low-stock":
    case "/stock":
      return prompt("List inventory items that are low on stock using low_stock_report.")
    case "/import":
      ops.setMode("admin")
      ops.setAdminTab("inventory")
      extra?.openInventoryImport?.()
      return true
    case "/followups":
    case "/follow-ups":
      ops.setMode("admin")
      ops.setAdminTab("billing")
      return (
        prompt(
          "Summarize outstanding invoice SMS or voice follow-ups for this practice if data is available in tools."
        ) || true
      )
    case "/handoff":
      ops.setMode("clinical")
      return prompt(
        "Draft a concise clinical handoff note for the active patient: current problems, meds, allergies, and pending tasks. No UUIDs in the output."
      )
    case "/labs":
      ops.setMode("admin")
      ops.setAdminTab("front_desk")
      ops.requestInboxScrollTo("labs")
      return true

    default:
      return false
  }
}
