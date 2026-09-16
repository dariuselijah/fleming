export type CommandCategory = "clinical" | "admin" | "search" | "files" | "navigation"

export interface SlashCommand {
  id: string
  trigger: string
  label: string
  description: string
  category: CommandCategory
  icon: string
  keywords: string[]
  requiresPatient: boolean
  action: "inline" | "panel" | "overlay" | "submit"
  /** Hidden from clinical copilot slash menu (doctor / medical student chat) */
  hideInClinicalChat?: boolean
}

const COMMANDS: SlashCommand[] = [
  // Clinical commands
  {
    id: "soap",
    trigger: "/soap",
    label: "SOAP Note",
    description: "Start or toggle the SOAP note template",
    category: "clinical",
    icon: "Clipboard",
    keywords: ["note", "documentation", "chart", "soap"],
    requiresPatient: true,
    action: "panel",
  },
  {
    id: "prescribe",
    trigger: "/prescribe",
    label: "Prescribe Medication",
    description: "Search and prescribe medications with dosing",
    category: "clinical",
    icon: "Pill",
    keywords: ["drug", "medication", "rx", "script", "prescription"],
    requiresPatient: true,
    action: "panel",
  },
  {
    id: "vitals",
    trigger: "/vitals",
    label: "Record Vitals",
    description: "Manually enter patient vital signs",
    category: "clinical",
    icon: "Heartbeat",
    keywords: ["bp", "heart rate", "temperature", "spo2", "weight"],
    requiresPatient: true,
    action: "panel",
  },
  {
    id: "icd",
    trigger: "/icd",
    label: "ICD-10 Code Lookup",
    description: "Search and assign ICD-10 diagnosis codes",
    category: "clinical",
    icon: "Hash",
    keywords: ["icd10", "diagnosis", "code", "coding", "billing"],
    requiresPatient: true,
    action: "panel",
  },
  {
    id: "refer",
    trigger: "/refer",
    label: "Referral Letter",
    description: "Generate a referral letter to a specialist",
    category: "clinical",
    icon: "ArrowRight",
    keywords: ["referral", "specialist", "letter", "transfer"],
    requiresPatient: true,
    action: "panel",
  },
  {
    id: "interactions",
    trigger: "/interactions",
    label: "Drug Interactions",
    description: "Check interactions between patient medications",
    category: "clinical",
    icon: "Warning",
    keywords: ["drug", "interaction", "safety", "contraindication"],
    requiresPatient: true,
    action: "submit",
  },
  {
    id: "summary",
    trigger: "/summary",
    label: "Clinical Summary",
    description: "Generate a clinical summary from the current consult",
    category: "clinical",
    icon: "FileText",
    keywords: ["summary", "handoff", "discharge", "clinical"],
    requiresPatient: true,
    action: "submit",
  },

  // Search commands
  {
    id: "evidence",
    trigger: "/evidence",
    label: "Search Evidence",
    description: "Search medical literature and guidelines",
    category: "search",
    icon: "BookOpen",
    keywords: ["pubmed", "literature", "research", "guideline", "evidence"],
    requiresPatient: false,
    action: "submit",
  },
  {
    id: "drug",
    trigger: "/drug",
    label: "Drug Information",
    description: "Look up drug details, dosing, and side effects",
    category: "search",
    icon: "Pill",
    keywords: ["drug", "medication", "dosing", "side effects", "pharmacology"],
    requiresPatient: false,
    action: "submit",
  },

  // Admin commands
  {
    id: "verify",
    trigger: "/verify",
    label: "Verify Medical Aid",
    description: "Check Medikredit eligibility for the active patient",
    category: "admin",
    icon: "ShieldCheck",
    keywords: ["medikredit", "eligibility", "medical aid", "verify", "check"],
    requiresPatient: true,
    action: "panel",
    hideInClinicalChat: true,
  },
  {
    id: "claim",
    trigger: "/claim",
    label: "Submit Claim",
    description: "Submit a billing claim for the current consult",
    category: "admin",
    icon: "Receipt",
    keywords: ["claim", "billing", "submit", "medprax", "invoice"],
    requiresPatient: true,
    action: "panel",
    hideInClinicalChat: true,
  },
  {
    id: "inventory",
    trigger: "/inventory",
    label: "Check Inventory",
    description: "View current stock levels and low-stock alerts",
    category: "admin",
    icon: "Package",
    keywords: ["stock", "inventory", "supply", "dispensing"],
    requiresPatient: false,
    action: "overlay",
    hideInClinicalChat: true,
  },

  // File commands
  {
    id: "upload",
    trigger: "/upload",
    label: "Attach Upload",
    description: "Reference a previously uploaded document",
    category: "files",
    icon: "FolderOpen",
    keywords: ["upload", "file", "document", "pdf", "attach"],
    requiresPatient: false,
    action: "panel",
  },
  {
    id: "library",
    trigger: "/library",
    label: "Patient Library",
    description: "Browse the patient's historical records",
    category: "files",
    icon: "Folder",
    keywords: ["history", "records", "library", "files", "past"],
    requiresPatient: true,
    action: "overlay",
  },

  // Navigation commands
  {
    id: "calendar",
    trigger: "/calendar",
    label: "Open Calendar",
    description: "View today's appointments",
    category: "navigation",
    icon: "Calendar",
    keywords: ["calendar", "appointments", "schedule", "booking"],
    requiresPatient: false,
    action: "overlay",
    hideInClinicalChat: true,
  },
  {
    id: "analytics",
    trigger: "/analytics",
    label: "Revenue Dashboard",
    description: "View today's revenue and claims stats",
    category: "navigation",
    icon: "TrendUp",
    keywords: ["analytics", "sales", "revenue", "income", "dashboard", "money"],
    requiresPatient: false,
    action: "overlay",
    hideInClinicalChat: true,
  },

  // Consult lifecycle
  {
    id: "sign",
    trigger: "/sign",
    label: "Sign Consult",
    description: "Sign off and finalize the current consult",
    category: "clinical",
    icon: "CheckCircle",
    keywords: ["sign", "finalize", "complete", "close", "done", "finish"],
    requiresPatient: true,
    action: "panel",
  },
  {
    id: "submit_claim",
    trigger: "/submit",
    label: "Submit to Medikredit",
    description: "Submit the claim to Medikredit for processing",
    category: "admin",
    icon: "PaperPlaneTilt",
    keywords: ["submit", "medikredit", "claim", "send", "process"],
    requiresPatient: true,
    action: "panel",
    hideInClinicalChat: true,
  },

  // Assistant / admin quick prompts (Ask Fleming bar also handles these via exec-admin-slash)
  {
    id: "eligibility_slash",
    trigger: "/eligibility",
    label: "MediKredit eligibility",
    description: "Run eligibility check for the attached patient (assistant)",
    category: "admin",
    icon: "ShieldCheck",
    keywords: ["eligibility", "medikredit", "scheme", "benefits"],
    requiresPatient: true,
    action: "submit",
    hideInClinicalChat: true,
  },
  {
    id: "famcheck_slash",
    trigger: "/famcheck",
    label: "Family / dependants",
    description: "MediKredit famcheck for dependants on the scheme",
    category: "admin",
    icon: "UserCircle",
    keywords: ["family", "dependants", "famcheck", "medikredit"],
    requiresPatient: true,
    action: "submit",
    hideInClinicalChat: true,
  },
  {
    id: "book_slash",
    trigger: "/book",
    label: "Find booking slots",
    description: "Ask assistant to find next available appointment slots",
    category: "navigation",
    icon: "Calendar",
    keywords: ["book", "appointment", "slots", "availability"],
    requiresPatient: true,
    action: "submit",
    hideInClinicalChat: true,
  },
  {
    id: "reminder_slash",
    trigger: "/reminder",
    label: "SMS reminder",
    description: "Send appointment SMS reminder via assistant",
    category: "admin",
    icon: "ChatText",
    keywords: ["sms", "reminder", "appointment"],
    requiresPatient: true,
    action: "submit",
    hideInClinicalChat: true,
  },
  {
    id: "cash_slash",
    trigger: "/cash",
    label: "Cash drawer",
    description: "Cash drawer status via assistant",
    category: "admin",
    icon: "CurrencyCircleDollar",
    keywords: ["cash", "drawer", "shift", "float"],
    requiresPatient: false,
    action: "submit",
    hideInClinicalChat: true,
  },
  {
    id: "statement_slash",
    trigger: "/statement",
    label: "Patient statement",
    description: "Generate patient account statement (assistant)",
    category: "admin",
    icon: "FileText",
    keywords: ["statement", "pdf", "account", "balance"],
    requiresPatient: true,
    action: "submit",
    hideInClinicalChat: true,
  },
  {
    id: "addpatient_slash",
    trigger: "/addpatient",
    label: "Add patient",
    description: "Open registration modal",
    category: "admin",
    icon: "UserPlus",
    keywords: ["register", "new patient", "add"],
    requiresPatient: false,
    action: "overlay",
    hideInClinicalChat: true,
  },
  {
    id: "import_slash",
    trigger: "/import",
    label: "Import inventory",
    description: "Open inventory CSV import",
    category: "admin",
    icon: "Upload",
    keywords: ["import", "csv", "stock", "bulk"],
    requiresPatient: false,
    action: "overlay",
    hideInClinicalChat: true,
  },
  {
    id: "low_stock_slash",
    trigger: "/low-stock",
    label: "Low stock report",
    description: "List low-stock inventory lines",
    category: "admin",
    icon: "Warning",
    keywords: ["stock", "low", "reorder"],
    requiresPatient: false,
    action: "submit",
    hideInClinicalChat: true,
  },
  {
    id: "handoff_slash",
    trigger: "/handoff",
    label: "Clinical handoff",
    description: "Draft a handoff note (clinical)",
    category: "clinical",
    icon: "ArrowsLeftRight",
    keywords: ["handoff", "signout", "sign-over", "handovers"],
    requiresPatient: true,
    action: "submit",
  },
  {
    id: "labs_slash",
    trigger: "/labs",
    label: "Labs inbox",
    description: "Jump to labs activity in inbox",
    category: "navigation",
    icon: "TestTube",
    keywords: ["labs", "results", "pathology"],
    requiresPatient: false,
    action: "overlay",
    hideInClinicalChat: true,
  },
]

export function getAllCommands(): SlashCommand[] {
  return COMMANDS
}

export function searchCommands(
  query: string,
  hasPatient: boolean,
  opts?: { clinicalCopilot?: boolean }
): SlashCommand[] {
  const clinical = opts?.clinicalCopilot ?? false
  const base = COMMANDS.filter((c) => {
    if (clinical && c.hideInClinicalChat) return false
    return true
  })
  const q = query.toLowerCase().replace(/^\//, "").trim()
  if (!q) return base.filter((c) => !c.requiresPatient || hasPatient)

  return base.filter((cmd) => {
    if (cmd.requiresPatient && !hasPatient) return false
    const haystack = [cmd.trigger, cmd.label, cmd.description, ...cmd.keywords]
      .join(" ")
      .toLowerCase()
    return haystack.includes(q)
  })
}

export function getCommandByTrigger(trigger: string): SlashCommand | undefined {
  const normalized = trigger.toLowerCase().trim()
  return COMMANDS.find((c) => c.trigger === normalized)
}

export const COMMAND_CATEGORIES: { id: CommandCategory; label: string }[] = [
  { id: "clinical", label: "Clinical" },
  { id: "search", label: "Search" },
  { id: "admin", label: "Admin" },
  { id: "files", label: "Files" },
  { id: "navigation", label: "Navigation" },
]
