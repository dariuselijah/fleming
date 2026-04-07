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
  },
]

export function getAllCommands(): SlashCommand[] {
  return COMMANDS
}

export function searchCommands(query: string, hasPatient: boolean): SlashCommand[] {
  const q = query.toLowerCase().replace(/^\//, "").trim()
  if (!q) return COMMANDS.filter((c) => !c.requiresPatient || hasPatient)

  return COMMANDS.filter((cmd) => {
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
