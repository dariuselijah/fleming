import type { LmsArtifact, LmsConnectionConfig, LmsCourse, LmsSyncPayload } from "./lms-types"

type CanvasCourse = {
  id?: number | string
  name?: string
  course_code?: string | null
  syllabus_body?: string | null
  term?: {
    name?: string | null
  } | null
}

type CanvasPageListRow = {
  page_id?: number | string
  url?: string
  title?: string
  updated_at?: string | null
}

type CanvasPage = {
  page_id?: number | string
  title?: string
  body?: string | null
  updated_at?: string | null
}

type CanvasAssignment = {
  id?: number | string
  name?: string
  description?: string | null
  due_at?: string | null
  updated_at?: string | null
}

type CanvasQuiz = {
  id?: number | string
  title?: string
  description?: string | null
  due_at?: string | null
  updated_at?: string | null
}

type CanvasModule = {
  id?: number | string
  name?: string
  updated_at?: string | null
  items?: Array<{
    id?: number | string
    title?: string
    type?: string
    html_url?: string | null
    url?: string | null
    content_id?: number | string | null
    completion_requirement?: Record<string, unknown> | null
  }>
}

type CanvasFile = {
  id?: number | string
  filename?: string
  display_name?: string | null
  "content-type"?: string | null
  content_type?: string | null
  updated_at?: string | null
  url?: string | null
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "")
}

function buildLinkMap(linkHeader: string | null): Record<string, string> {
  if (!linkHeader) return {}
  const map: Record<string, string> = {}
  const segments = linkHeader.split(",")
  for (const segment of segments) {
    const trimmed = segment.trim()
    const urlMatch = trimmed.match(/<([^>]+)>/)
    const relMatch = trimmed.match(/rel="([^"]+)"/)
    if (!urlMatch || !relMatch) continue
    map[relMatch[1]] = urlMatch[1]
  }
  return map
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export class CanvasLmsClient {
  private readonly baseUrl: string
  private readonly token: string

  constructor(config: LmsConnectionConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl)
    this.token = config.accessToken
  }

  private async fetchJson<T>(url: string): Promise<{ data: T | null; nextUrl: string | null }> {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Canvas request failed (${response.status}): ${body.slice(0, 220)}`)
    }
    const payload = (await response.json()) as T
    const links = buildLinkMap(response.headers.get("link") || response.headers.get("Link"))
    return {
      data: payload,
      nextUrl: links.next || null,
    }
  }

  private async fetchPaginatedArray<T>(path: string): Promise<T[]> {
    let nextUrl: string | null = `${this.baseUrl}${path}`
    const rows: T[] = []
    while (nextUrl) {
      const pageResult: {
        data: T[] | Record<string, unknown> | null
        nextUrl: string | null
      } = await this.fetchJson<T[] | Record<string, unknown>>(nextUrl)
      if (Array.isArray(pageResult.data)) {
        rows.push(...pageResult.data)
      } else if (pageResult.data) {
        rows.push(pageResult.data as T)
      }
      nextUrl = pageResult.nextUrl
    }
    return rows
  }

  async listCourses(): Promise<LmsCourse[]> {
    const rows = await this.fetchPaginatedArray<CanvasCourse>(
      "/api/v1/courses?enrollment_state=active&state[]=available&per_page=100"
    )
    const courses: LmsCourse[] = []
    for (const course of rows) {
      const id = course.id !== undefined ? String(course.id) : ""
      const name = toText(course.name)
      if (!id || !name) continue
      courses.push({
        id,
        name,
        code: course.course_code || null,
        term: course.term?.name || null,
        metadata: {
          syllabusBody: typeof course.syllabus_body === "string" ? course.syllabus_body : null,
        },
      })
    }
    return courses
  }

  private async listCoursePages(courseId: string): Promise<CanvasPage[]> {
    const pageRows = await this.fetchPaginatedArray<CanvasPageListRow>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/pages?per_page=100`
    )
    const output: CanvasPage[] = []
    for (const row of pageRows) {
      const pageSlug = toText(row.url)
      if (!pageSlug) continue
      try {
        const response = await this.fetchJson<CanvasPage>(
          `${this.baseUrl}/api/v1/courses/${encodeURIComponent(courseId)}/pages/${encodeURIComponent(pageSlug)}`
        )
        if (response.data) {
          output.push(response.data)
        }
      } catch {
        output.push({
          page_id: row.page_id,
          title: row.title,
          body: null,
          updated_at: row.updated_at || null,
        })
      }
    }
    return output
  }

  async fetchCoursePayload(course: LmsCourse): Promise<LmsSyncPayload> {
    const courseId = course.id
    const [modules, pages, assignments, quizzes, files] = await Promise.all([
      this.fetchPaginatedArray<CanvasModule>(
        `/api/v1/courses/${encodeURIComponent(courseId)}/modules?include[]=items&per_page=100`
      ),
      this.listCoursePages(courseId),
      this.fetchPaginatedArray<CanvasAssignment>(
        `/api/v1/courses/${encodeURIComponent(courseId)}/assignments?per_page=100`
      ),
      this.fetchPaginatedArray<CanvasQuiz>(
        `/api/v1/courses/${encodeURIComponent(courseId)}/quizzes?per_page=100`
      ),
      this.fetchPaginatedArray<CanvasFile>(
        `/api/v1/courses/${encodeURIComponent(courseId)}/files?per_page=100`
      ),
    ])

    const artifacts: LmsArtifact[] = []

    const syllabusBody =
      typeof course.metadata?.syllabusBody === "string" ? toText(course.metadata.syllabusBody) : ""
    if (syllabusBody) {
      artifacts.push({
        provider: "canvas",
        courseId: course.id,
        courseName: course.name,
        externalId: `${course.id}:overview`,
        artifactType: "course_overview",
        title: `${course.name} syllabus`,
        bodyText: stripHtml(syllabusBody),
        metadata: {},
      })
    }

    for (const moduleRow of modules) {
      const moduleId = moduleRow.id !== undefined ? String(moduleRow.id) : ""
      const moduleName = toText(moduleRow.name) || "Module"
      for (const item of moduleRow.items || []) {
        const itemId = item.id !== undefined ? String(item.id) : ""
        const title = toText(item.title) || `${moduleName} item`
        if (!itemId) continue
        const bodyText = stripHtml(
          [moduleName, title, toText(item.type), toText(item.html_url), toText(item.url)]
            .filter(Boolean)
            .join("\n")
        )
        artifacts.push({
          provider: "canvas",
          courseId: course.id,
          courseName: course.name,
          externalId: `${moduleId}:${itemId}`,
          artifactType: "module_item",
          title,
          bodyText,
          externalUpdatedAt: moduleRow.updated_at || null,
          metadata: {
            moduleName,
            moduleId,
            itemType: item.type || null,
            contentId: item.content_id || null,
            htmlUrl: item.html_url || null,
            url: item.url || null,
            completionRequirement: item.completion_requirement || null,
          },
        })
      }
    }

    for (const page of pages) {
      const pageId = page.page_id !== undefined ? String(page.page_id) : ""
      if (!pageId) continue
      artifacts.push({
        provider: "canvas",
        courseId: course.id,
        courseName: course.name,
        externalId: pageId,
        artifactType: "page",
        title: toText(page.title) || "Page",
        bodyText: stripHtml(toText(page.body || "")),
        externalUpdatedAt: page.updated_at || null,
        metadata: {},
      })
    }

    for (const assignment of assignments) {
      const id = assignment.id !== undefined ? String(assignment.id) : ""
      if (!id) continue
      artifacts.push({
        provider: "canvas",
        courseId: course.id,
        courseName: course.name,
        externalId: id,
        artifactType: "assignment",
        title: toText(assignment.name) || "Assignment",
        bodyText: stripHtml(toText(assignment.description || "")),
        externalUpdatedAt: assignment.updated_at || null,
        dueAt: assignment.due_at || null,
        metadata: {},
      })
    }

    for (const quiz of quizzes) {
      const id = quiz.id !== undefined ? String(quiz.id) : ""
      if (!id) continue
      artifacts.push({
        provider: "canvas",
        courseId: course.id,
        courseName: course.name,
        externalId: id,
        artifactType: "quiz",
        title: toText(quiz.title) || "Quiz",
        bodyText: stripHtml(toText(quiz.description || "")),
        externalUpdatedAt: quiz.updated_at || null,
        dueAt: quiz.due_at || null,
        metadata: {},
      })
    }

    for (const file of files) {
      const id = file.id !== undefined ? String(file.id) : ""
      if (!id) continue
      artifacts.push({
        provider: "canvas",
        courseId: course.id,
        courseName: course.name,
        externalId: id,
        artifactType: "file",
        title: toText(file.display_name) || toText(file.filename) || "File",
        bodyText: "",
        externalUpdatedAt: file.updated_at || null,
        fileName: toText(file.filename) || null,
        mimeType: file.content_type || file["content-type"] || null,
        fileUrl: toText(file.url) || null,
        metadata: {},
      })
    }

    return {
      courses: [course],
      artifacts,
    }
  }
}
