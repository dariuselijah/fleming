import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

function read(path: string) {
  return readFileSync(path, "utf-8")
}

function testRouteClarificationGuards() {
  const route = read("app/api/chat/route.ts")
  assert.match(
    route,
    /const isTextbookScaleUpload\s*=/,
    "Route should compute textbook-scale upload heuristic"
  )
  assert.match(
    route,
    /const artifactWorkflowStage:\s*"none"\s*\|\s*"inspect"\s*\|\s*"refine"\s*\|\s*"generate"/,
    "Route should enforce explicit inspect/refine/generate workflow stages"
  )
  assert.match(
    route,
    /requiresInspectionBeforeGeneration[\s\S]*inspectionGateSatisfied/,
    "Route should block generation when inspection gate is not satisfied"
  )
  assert.match(
    route,
    /toolName:\s*"refineQuizRequirements"|toolName:\s*"generateQuizFromUpload"/,
    "Route should force quiz refinement/generation tool choice in artifact stages"
  )
  assert.match(
    route,
    /pendingArtifactStage:\s*artifactWorkflowStage/,
    "Route should persist workflow stage in topic context"
  )
  assert.match(
    route,
    /decodeArtifactWorkflowInput\(stripUploadReferenceTokens\(rawQueryText\)\)/,
    "Route should decode workflow-only refinement inputs before orchestration"
  )
  assert.match(
    route,
    /const requestedArtifactIntent = artifactIntentFromRequest === "quiz" \? "quiz" : "none"[\s\S]*const artifactIntent =[\s\S]*\? "quiz"[\s\S]*: "none"/,
    "Route should keep artifact intents quiz-only while allowing context-aware quiz intent inference"
  )
  assert.match(
    route,
    /const canUseArtifactTools\s*=\s*[\s\S]*supportsTools[\s\S]*ENABLE_UPLOAD_CONTEXT_SEARCH/,
    "Artifact tools should not depend on evidence toggle alone"
  )
  assert.match(
    route,
    /type:\s*"artifact-runtime-warnings"/,
    "Route should stream artifact runtime warning annotations"
  )
  assert.doesNotMatch(
    route,
    /generateDocumentFromUpload:\s*tool\(/,
    "Route should not expose document generation runtime tools"
  )
  assert.match(
    route,
    /inspectUploadStructure:\s*tool\(/,
    "Route should expose inspectUploadStructure runtime tool"
  )
}

function testUploadServerStructureAndSynthesis() {
  const server = read("lib/uploads/server.ts")
  assert.match(
    server,
    /async inspectUploadStructure\(/,
    "Upload service should implement structure inspection"
  )
  assert.match(
    server,
    /classifyDocumentPart\(/,
    "Structure inspection should classify document parts"
  )
  assert.match(
    server,
    /mapTopicsToSourceRanges\(/,
    "TOC topics should be mapped onto source page ranges"
  )
  assert.match(
    server,
    /sourcePageStart|sourcePageEnd|pageOffsetEstimate/,
    "Mapped topic ranges should include source-page coordinates"
  )
  assert.match(
    server,
    /requiredBodyEvidence\s*=\s*structureInspection\?\.textbookScale\s*\?\s*2\s*:\s*1/,
    "Section retrieval should require body-evidence thresholds before section inclusion"
  )
  assert.match(
    server,
    /filterArtifactSectionContent\(/,
    "Final artifact assembly should run quality filtering on section content"
  )
  assert.match(
    server,
    /fallbackReason:\s*"none"/,
    "Upload context metrics should include explicit fallback reason"
  )
}

function testWorkflowBiasCleanup() {
  const route = read("app/api/chat/route.ts")
  const uploadsWorkspace = read("app/components/uploads/uploads-workspace.tsx")
  const conversation = read("app/components/chat/conversation.tsx")
  assert.match(
    route,
    /preview may be incomplete for large PDFs[\s\S]*prefer upload tools/,
    "Artifact flows should not over-trust raw attachment preview text"
  )
  assert.doesNotMatch(
    uploadsWorkspace,
    /Use Harvard references and include a structured bibliography\./,
    "Upload workspace should not default document prompts to bibliography-heavy output"
  )
  assert.doesNotMatch(
    uploadsWorkspace,
    /Generate Doc/,
    "Uploads workspace should not expose document-generation CTA"
  )
  assert.match(
    conversation,
    /isArtifactWorkflowInput\(message\.content\)/,
    "Workflow-only refinement messages should stay in the same UI workflow"
  )
}

function testEmbeddingProviderSafety() {
  const embeddings = read("lib/rag/embeddings.ts")
  assert.match(
    embeddings,
    /Embedding provider mismatch: non-OpenAI API key/,
    "Embedding layer should fail fast on provider/key mismatch"
  )
}

function run() {
  testRouteClarificationGuards()
  testUploadServerStructureAndSynthesis()
  testWorkflowBiasCleanup()
  testEmbeddingProviderSafety()
  console.log("upload artifact regression checks passed")
}

run()
