import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

function read(path: string) {
  return readFileSync(path, "utf-8")
}

function testMediaPipelineExtractionWiring() {
  const uploadServer = read("lib/uploads/server.ts")
  const mediaPipeline = read("lib/media/pipeline.ts")
  const transcription = read("lib/media/transcription.ts")
  const ocr = read("lib/media/ocr.ts")
  const chatRoute = read("app/api/chat/route.ts")

  assert.match(
    uploadServer,
    /buildImageDocumentFromMediaPipeline|buildVideoDocumentFromMediaPipeline/,
    "Uploads service should delegate image/video parsing to lib/media pipeline"
  )
  assert.match(
    mediaPipeline,
    /extractDocumentTextWithOcr/,
    "Media pipeline should call OCR provider abstraction"
  )
  assert.match(
    mediaPipeline,
    /transcribeMedia/,
    "Media pipeline should call transcription provider abstraction"
  )
  assert.match(
    transcription,
    /gpt-4o-transcribe-diarize/,
    "Transcription module should prefer diarized OpenAI transcription"
  )
  assert.match(
    transcription,
    /OPENAI_MAX_AUDIO_BYTES/,
    "Transcription module should enforce chunk fallback for upload-size limits"
  )
  assert.match(
    ocr,
    /documentModels\/prebuilt-read:analyze/,
    "OCR module should target Azure Document Intelligence prebuilt-read endpoint"
  )
  assert.match(
    chatRoute,
    /summarizeTextForNotes/,
    "Chat lecture summarization should reuse shared media summarizer"
  )
}

function testLmsSyncArchitecture() {
  const pluginServer = read("lib/plugins/server.ts")
  const lmsSync = read("lib/plugins/lms-sync.ts")
  const canvasClient = read("lib/plugins/canvas-client.ts")
  const moodleClient = read("lib/plugins/moodle-client.ts")
  const migration = read("migrate-student-workspace-platform.sql")
  const libraryRoute = read("app/api/student-workspace/plugins/library/route.ts")

  assert.match(
    pluginServer,
    /syncLmsPlugin\(/,
    "Plugin server should invoke LMS sync orchestration for LMS plugins"
  )
  assert.match(
    pluginServer,
    /validateLmsConnection\(/,
    "Plugin connect flow should validate Moodle/Canvas credentials before saving"
  )
  assert.match(
    lmsSync,
    /student_lms_courses|student_lms_artifacts/,
    "LMS sync should persist normalized courses and artifacts"
  )
  assert.match(
    lmsSync,
    /ingestStoredUpload/,
    "LMS sync should route normalized artifacts through upload ingestion pipeline"
  )
  assert.match(
    canvasClient,
    /\/api\/v1\/courses/,
    "Canvas client should query course endpoints"
  )
  assert.match(
    moodleClient,
    /core_course_get_contents|mod_assign_get_assignments|mod_quiz_get_quizzes_by_courses/,
    "Moodle client should query core course, assignment, and quiz endpoints"
  )
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS student_lms_courses/,
    "Migration should define student_lms_courses table"
  )
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS student_lms_artifacts/,
    "Migration should define student_lms_artifacts table"
  )
  assert.match(
    libraryRoute,
    /from\(LMS_COURSES_TABLE\)|from\(LMS_ARTIFACTS_TABLE\)/,
    "Plugin library route should expose LMS courses and artifacts to frontend"
  )
}

function testPlannerReviewSourceScoping() {
  const planner = read("lib/student-workspace/planner.ts")
  const review = read("lib/student-workspace/review.ts")
  const sourceScope = read("lib/student-workspace/source-scope.ts")
  const plannerRoute = read("app/api/student-workspace/planner/generate/route.ts")
  const reviewRoute = read("app/api/student-workspace/review/generate/route.ts")
  const workspace = read("app/components/student-workspace/student-workspace.tsx")

  assert.match(
    sourceScope,
    /resolveScopedUploadIds/,
    "Source-scope utility should resolve course-scoped upload IDs"
  )
  assert.match(
    planner,
    /uploadIds\?: string\[][\s\S]*courseIds\?: string\[][\s\S]*topicLabels\?: string\[]/,
    "Planner service should accept upload/course/topic filters"
  )
  assert.match(
    review,
    /uploadIds\?: string\[][\s\S]*courseIds\?: string\[][\s\S]*topicLabels\?: string\[]/,
    "Review service should accept upload/course/topic filters"
  )
  assert.match(
    plannerRoute,
    /uploadIds|courseIds|topicLabels|graphNodeIds/,
    "Planner API should forward scope filters"
  )
  assert.match(
    reviewRoute,
    /uploadIds|courseIds|topicLabels|graphNodeIds/,
    "Review API should forward scope filters"
  )
  assert.match(
    workspace,
    /Plan scope|Review scope|Synced LMS artifacts/,
    "Student workspace UI should expose scoped planner/review and LMS artifact views"
  )
}

function run() {
  testMediaPipelineExtractionWiring()
  testLmsSyncArchitecture()
  testPlannerReviewSourceScoping()
  console.log("LMS + media platform regression checks passed")
}

run()
