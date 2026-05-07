import type { LmsArtifact, LmsConnectionConfig, LmsCourse, LmsSyncPayload } from "./lms-types"

type MoodleSiteInfo = {
  userid?: number
}

type MoodleCourse = {
  id?: number
  shortname?: string
  fullname?: string
  displayname?: string
  startdate?: number
  enddate?: number
}

type MoodleModule = {
  id?: number
  modname?: string
  name?: string
  description?: string
  url?: string
  contents?: Array<{
    filename?: string
    fileurl?: string
    mimetype?: string
    timemodified?: number
  }>
}

type MoodleSection = {
  id?: number
  name?: string
  summary?: string
  modules?: MoodleModule[]
}

type MoodleAssignment = {
  id?: number
  name?: string
  intro?: string
  duedate?: number
  timemodified?: number
}

type MoodleQuiz = {
  id?: number
  name?: string
  intro?: string
  timeclose?: number
  timemodified?: number
}

type MoodlePage = {
  id?: number
  name?: string
  intro?: string
  content?: string
  timemodified?: number
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "")
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function toIsoFromUnix(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null
  return new Date(value * 1000).toISOString()
}

function appendParams(
  params: URLSearchParams,
  prefix: string,
  value: string | number | boolean | null | undefined | Array<string | number | boolean>
) {
  if (value === null || value === undefined) return
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendParams(params, `${prefix}[${index}]`, item)
    })
    return
  }
  params.set(prefix, String(value))
}

export class MoodleLmsClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly restUrl: string

  constructor(config: LmsConnectionConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl)
    this.token = config.accessToken
    this.restUrl = `${this.baseUrl}/webservice/rest/server.php`
  }

  private async callWs<T>(
    wsFunction: string,
    payload: Record<string, string | number | boolean | Array<string | number | boolean>> = {}
  ): Promise<T> {
    const params = new URLSearchParams()
    params.set("wstoken", this.token)
    params.set("moodlewsrestformat", "json")
    params.set("wsfunction", wsFunction)
    for (const [key, value] of Object.entries(payload)) {
      appendParams(params, key, value)
    }

    const response = await fetch(`${this.restUrl}?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Moodle request failed (${response.status}): ${body.slice(0, 220)}`)
    }
    const raw = (await response.json()) as Record<string, unknown>
    if (
      typeof raw.exception === "string" ||
      (typeof raw.errorcode === "string" && typeof raw.message === "string")
    ) {
      const message = typeof raw.message === "string" ? raw.message : "Moodle API error"
      throw new Error(`${wsFunction} failed: ${message}`)
    }
    return raw as T
  }

  private withToken(fileUrl: string): string {
    if (!fileUrl) return fileUrl
    const tokenRegex = /[?&](token|wstoken)=/
    if (tokenRegex.test(fileUrl)) return fileUrl
    return `${fileUrl}${fileUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(this.token)}`
  }

  async listCourses(): Promise<LmsCourse[]> {
    const siteInfo = await this.callWs<MoodleSiteInfo>("core_webservice_get_site_info")
    const userId = typeof siteInfo.userid === "number" ? siteInfo.userid : null
    let rows: MoodleCourse[] = []
    if (userId) {
      rows = await this.callWs<MoodleCourse[]>("core_enrol_get_users_courses", {
        userid: userId,
      })
    } else {
      rows = await this.callWs<MoodleCourse[]>("core_course_get_courses")
    }

    const courses: LmsCourse[] = []
    for (const course of rows) {
      const id = typeof course.id === "number" ? String(course.id) : ""
      const name = toText(course.fullname) || toText(course.displayname) || toText(course.shortname)
      if (!id || !name) continue
      courses.push({
        id,
        name,
        code: toText(course.shortname) || null,
        term: null,
        metadata: {
          startDate: toIsoFromUnix(course.startdate),
          endDate: toIsoFromUnix(course.enddate),
        },
      })
    }
    return courses
  }

  async fetchCoursePayload(course: LmsCourse): Promise<LmsSyncPayload> {
    const courseIdNum = Number.parseInt(course.id, 10)
    const contents = await this.callWs<MoodleSection[]>("core_course_get_contents", {
      courseid: courseIdNum,
    })

    let assignments: MoodleAssignment[] = []
    try {
      const assignmentPayload = await this.callWs<{ courses?: Array<{ assignments?: MoodleAssignment[] }> }>(
        "mod_assign_get_assignments",
        { courseids: [courseIdNum] }
      )
      assignments = (assignmentPayload.courses || []).flatMap((row) => row.assignments || [])
    } catch {
      assignments = []
    }

    let quizzes: MoodleQuiz[] = []
    try {
      const quizPayload = await this.callWs<{ quizzes?: MoodleQuiz[] }>(
        "mod_quiz_get_quizzes_by_courses",
        { courseids: [courseIdNum] }
      )
      quizzes = quizPayload.quizzes || []
    } catch {
      quizzes = []
    }

    let pages: MoodlePage[] = []
    try {
      const pagePayload = await this.callWs<{ pages?: MoodlePage[] }>("mod_page_get_pages_by_courses", {
        courseids: [courseIdNum],
      })
      pages = pagePayload.pages || []
    } catch {
      pages = []
    }

    const artifacts: LmsArtifact[] = []

    for (const section of contents || []) {
      const sectionName = toText(section.name)
      if (sectionName) {
        artifacts.push({
          provider: "moodle",
          courseId: course.id,
          courseName: course.name,
          externalId: `section:${section.id || sectionName}`,
          artifactType: "course_overview",
          title: sectionName,
          bodyText: stripHtml(toText(section.summary || "")),
          metadata: {},
        })
      }

      for (const moduleRow of section.modules || []) {
        const moduleId = moduleRow.id !== undefined ? String(moduleRow.id) : ""
        if (!moduleId) continue
        const title = toText(moduleRow.name) || `${toText(moduleRow.modname) || "resource"} item`
        artifacts.push({
          provider: "moodle",
          courseId: course.id,
          courseName: course.name,
          externalId: `module:${moduleId}`,
          artifactType: "module_item",
          title,
          bodyText: stripHtml(
            [toText(moduleRow.modname), title, toText(moduleRow.description), toText(moduleRow.url)]
              .filter(Boolean)
              .join("\n")
          ),
          metadata: {
            moduleName: toText(moduleRow.modname) || null,
            sectionName: sectionName || null,
            moduleUrl: toText(moduleRow.url) || null,
          },
        })

        for (const item of moduleRow.contents || []) {
          const fileUrl = toText(item.fileurl)
          const fileName = toText(item.filename)
          if (!fileUrl || !fileName) continue
          artifacts.push({
            provider: "moodle",
            courseId: course.id,
            courseName: course.name,
            externalId: `file:${moduleId}:${fileName}`,
            artifactType: "file",
            title: fileName,
            bodyText: "",
            externalUpdatedAt: toIsoFromUnix(item.timemodified),
            fileName,
            mimeType: toText(item.mimetype) || null,
            fileUrl: this.withToken(fileUrl),
            metadata: {
              moduleId,
            },
          })
        }
      }
    }

    for (const assignment of assignments) {
      const id = assignment.id !== undefined ? String(assignment.id) : ""
      if (!id) continue
      artifacts.push({
        provider: "moodle",
        courseId: course.id,
        courseName: course.name,
        externalId: `assignment:${id}`,
        artifactType: "assignment",
        title: toText(assignment.name) || "Assignment",
        bodyText: stripHtml(toText(assignment.intro || "")),
        dueAt: toIsoFromUnix(assignment.duedate),
        externalUpdatedAt: toIsoFromUnix(assignment.timemodified),
        metadata: {},
      })
    }

    for (const quiz of quizzes) {
      const id = quiz.id !== undefined ? String(quiz.id) : ""
      if (!id) continue
      artifacts.push({
        provider: "moodle",
        courseId: course.id,
        courseName: course.name,
        externalId: `quiz:${id}`,
        artifactType: "quiz",
        title: toText(quiz.name) || "Quiz",
        bodyText: stripHtml(toText(quiz.intro || "")),
        dueAt: toIsoFromUnix(quiz.timeclose),
        externalUpdatedAt: toIsoFromUnix(quiz.timemodified),
        metadata: {},
      })
    }

    for (const page of pages) {
      const id = page.id !== undefined ? String(page.id) : ""
      if (!id) continue
      artifacts.push({
        provider: "moodle",
        courseId: course.id,
        courseName: course.name,
        externalId: `page:${id}`,
        artifactType: "page",
        title: toText(page.name) || "Page",
        bodyText: stripHtml(toText(page.content || page.intro || "")),
        externalUpdatedAt: toIsoFromUnix(page.timemodified),
        metadata: {},
      })
    }

    return {
      courses: [course],
      artifacts,
    }
  }
}
