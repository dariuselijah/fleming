/**
 * Strip common honorifics before splitting a display name for MEM/PAT (MediKredit, etc.).
 * Handles repeated titles ("Dr Prof …") conservatively.
 */
const LEADING_TITLE_RE =
  /^(Mr|Mrs|Ms|Miss|Mister|Missus|Dr|Prof|Professor|Rev|Fr|Sr|Hon|The)\.?\s+/i

export function stripLeadingNameTitles(name: string): string {
  let s = name.trim()
  let prev = ""
  while (s !== prev) {
    prev = s
    s = s.replace(LEADING_TITLE_RE, "").trim()
  }
  return s
}

/** Given name, surname, and initials for switch XML — titles removed from the first token. */
export function splitPersonNameParts(name: string): { fname: string; sname: string; ini: string } {
  const cleaned = stripLeadingNameTitles(name)
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { fname: "", sname: "", ini: "" }
  const fname = parts[0] ?? ""
  const sname = parts.length > 1 ? parts[parts.length - 1]! : ""
  const ini = `${(fname[0] ?? "").toUpperCase()}${(sname[0] ?? "").toUpperCase()}`
  return { fname, sname, ini }
}
