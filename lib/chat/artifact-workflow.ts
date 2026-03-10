export const ARTIFACT_WORKFLOW_INPUT_PREFIX = "__artifact_workflow_input__:"

export function isArtifactWorkflowInput(value: string): boolean {
  return value.trimStart().startsWith(ARTIFACT_WORKFLOW_INPUT_PREFIX)
}

export function encodeArtifactWorkflowInput(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return `${ARTIFACT_WORKFLOW_INPUT_PREFIX}${trimmed}`
}

export function decodeArtifactWorkflowInput(value: string): string {
  const normalized = value.trimStart()
  if (!normalized.startsWith(ARTIFACT_WORKFLOW_INPUT_PREFIX)) return value
  return normalized.slice(ARTIFACT_WORKFLOW_INPUT_PREFIX.length).trim()
}
