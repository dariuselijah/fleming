/** Plain-text preview for document lists (no raw ## or ** in snippets). */
export function stripClinicalMarkdownPreview(text: string, maxLen = 160): string {
  let s = text
    .replace(/===[\s\S]*?===/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[\d+\]/g, "")
    .replace(/`{1,3}[^`]*`{1,3}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`
  return s
}
