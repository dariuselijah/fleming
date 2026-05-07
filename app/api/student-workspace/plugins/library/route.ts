/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isStudentPluginId } from "@/lib/plugins/catalog"

const LMS_COURSES_TABLE = "student_lms_courses"
const LMS_ARTIFACTS_TABLE = "student_lms_artifacts"

function isMissingTableError(error: unknown): boolean {
  const message = String((error as { message?: string } | undefined)?.message || "")
  return /student_lms_courses|student_lms_artifacts|does not exist|42P01/i.test(message)
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 })
    }
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(request.url)
    const pluginIdParam = url.searchParams.get("pluginId") || undefined
    const pluginId = pluginIdParam && isStudentPluginId(pluginIdParam) ? pluginIdParam : undefined

    let coursesQuery = (supabase as any)
      .from(LMS_COURSES_TABLE)
      .select("*")
      .eq("user_id", user.id)
      .order("course_name", { ascending: true })
      .limit(500)
    let artifactsQuery = (supabase as any)
      .from(LMS_ARTIFACTS_TABLE)
      .select("*")
      .eq("user_id", user.id)
      .order("synced_at", { ascending: false })
      .limit(2000)

    if (pluginId) {
      coursesQuery = coursesQuery.eq("plugin_id", pluginId)
      artifactsQuery = artifactsQuery.eq("plugin_id", pluginId)
    }

    const [coursesResult, artifactsResult] = await Promise.all([coursesQuery, artifactsQuery])
    if (coursesResult.error && !isMissingTableError(coursesResult.error)) {
      throw new Error(coursesResult.error.message || "Failed to load LMS courses")
    }
    if (artifactsResult.error && !isMissingTableError(artifactsResult.error)) {
      throw new Error(artifactsResult.error.message || "Failed to load LMS artifacts")
    }

    const courses = ((coursesResult.data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id || ""),
      pluginId: String(row.plugin_id || ""),
      provider: (row.provider === "canvas" ? "canvas" : "moodle") as "canvas" | "moodle",
      externalCourseId: String(row.external_course_id || ""),
      courseName: String(row.course_name || "Course"),
      courseCode: typeof row.course_code === "string" ? row.course_code : null,
      termName: typeof row.term_name === "string" ? row.term_name : null,
      lastSyncedAt: typeof row.last_synced_at === "string" ? row.last_synced_at : null,
      metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {},
    }))

    const artifacts = ((artifactsResult.data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id || ""),
      pluginId: String(row.plugin_id || ""),
      provider: (row.provider === "canvas" ? "canvas" : "moodle") as "canvas" | "moodle",
      courseId: String(row.course_id || ""),
      courseName: String(row.course_name || "Course"),
      externalId: String(row.external_id || ""),
      artifactType: String(row.artifact_type || "resource"),
      title: String(row.title || "Artifact"),
      dueAt: typeof row.due_at === "string" ? row.due_at : null,
      uploadId: typeof row.upload_id === "string" ? row.upload_id : null,
      syncedAt: typeof row.synced_at === "string" ? row.synced_at : null,
      metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {},
    }))

    return NextResponse.json({
      courses,
      artifacts,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load plugin library",
      },
      { status: 500 }
    )
  }
}
