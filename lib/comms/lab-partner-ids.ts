export const LAB_PARTNER_DEFS = [
  { id: "lancet" as const, label: "Lancet Laboratories" },
  { id: "ampath" as const, label: "Ampath" },
  { id: "pathcare" as const, label: "PathCare" },
]

export type LabPartnerId = (typeof LAB_PARTNER_DEFS)[number]["id"]
