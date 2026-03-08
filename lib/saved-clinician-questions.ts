"use client"

import { normalizeClinicianWorkflowMode, type ClinicianWorkflowMode } from "@/lib/clinician-mode"

export const SAVED_CLINICIAN_QUESTIONS_STORAGE_KEY = "saved-clinician-questions"
export const RUN_SAVED_QUESTION_EVENT = "fleming:run-saved-question"
const MAX_SAVED_QUESTIONS = 12

export type SavedClinicianQuestion = {
  id: string
  prompt: string
  title: string
  workflow: ClinicianWorkflowMode
  savedAt: string
  lastReviewedAt: string
  evidenceCount?: number
  latestYear?: number | null
}

export type RunSavedQuestionEventDetail = {
  question: SavedClinicianQuestion
  refreshMode: boolean
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

export function buildSavedQuestionTitle(prompt: string) {
  const firstSentence = prompt
    .replace(/\s+/g, " ")
    .trim()
    .split(/\n|(?<=[.?!])\s+/)[0]

  if (firstSentence.length <= 80) return firstSentence
  return `${firstSentence.slice(0, 77).trimEnd()}...`
}

export function getSavedClinicianQuestions(): SavedClinicianQuestion[] {
  if (!canUseStorage()) return []

  try {
    const raw = window.localStorage.getItem(SAVED_CLINICIAN_QUESTIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedClinicianQuestion[]
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => ({
        ...item,
        workflow: normalizeClinicianWorkflowMode(item.workflow),
      }))
      .filter((item) => item.prompt?.trim())
      .sort(
        (a, b) =>
          new Date(b.lastReviewedAt || b.savedAt).getTime() -
          new Date(a.lastReviewedAt || a.savedAt).getTime()
      )
  } catch (error) {
    console.error("[SavedClinicianQuestions] Failed to parse saved questions", error)
    return []
  }
}

function persistSavedClinicianQuestions(items: SavedClinicianQuestion[]) {
  if (!canUseStorage()) return

  window.localStorage.setItem(
    SAVED_CLINICIAN_QUESTIONS_STORAGE_KEY,
    JSON.stringify(items.slice(0, MAX_SAVED_QUESTIONS))
  )
}

export function upsertSavedClinicianQuestion(
  item: Omit<SavedClinicianQuestion, "id" | "savedAt" | "lastReviewedAt" | "title"> & {
    title?: string
  }
) {
  const now = new Date().toISOString()
  const promptKey = item.prompt.trim().toLowerCase()
  const existing = getSavedClinicianQuestions()
  const match = existing.find((entry) => entry.prompt.trim().toLowerCase() === promptKey)

  const nextItem: SavedClinicianQuestion = {
    id: match?.id || `saved-question-${Date.now()}`,
    prompt: item.prompt.trim(),
    title: item.title?.trim() || buildSavedQuestionTitle(item.prompt),
    workflow: normalizeClinicianWorkflowMode(item.workflow),
    savedAt: match?.savedAt || now,
    lastReviewedAt: now,
    evidenceCount: item.evidenceCount,
    latestYear: item.latestYear ?? null,
  }

  const next = [nextItem, ...existing.filter((entry) => entry.id !== match?.id)]
  persistSavedClinicianQuestions(next)
  return nextItem
}

export function removeSavedClinicianQuestion(id: string) {
  const existing = getSavedClinicianQuestions()
  persistSavedClinicianQuestions(existing.filter((item) => item.id !== id))
}

export function markSavedQuestionReviewed(id: string) {
  const existing = getSavedClinicianQuestions()
  const next = existing.map((item) =>
    item.id === id ? { ...item, lastReviewedAt: new Date().toISOString() } : item
  )
  persistSavedClinicianQuestions(next)
}

export function isEvidenceRefreshDue(savedQuestion: SavedClinicianQuestion, days = 7) {
  const referenceDate = savedQuestion.lastReviewedAt || savedQuestion.savedAt
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return new Date(referenceDate).getTime() <= cutoff
}

export function dispatchRunSavedQuestionEvent(
  detail: RunSavedQuestionEventDetail
) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<RunSavedQuestionEventDetail>(RUN_SAVED_QUESTION_EVENT, {
      detail,
    })
  )
}
