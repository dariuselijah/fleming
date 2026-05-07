import type { ChartDrilldownPayload } from "@/app/components/charts/chat-chart"
import type { EvidenceCitation } from "@/lib/evidence/types"

export type DrilldownTaskStatus = "pending" | "running" | "completed" | "failed"

export type DrilldownTask = {
  id: string
  label: string
  status: DrilldownTaskStatus
  detail?: string
}

export type DrilldownRuntimeStatus = "idle" | "running" | "ready" | "error"

export type DrilldownState = {
  open: boolean
  runId: string | null
  pointId: string | null
  context: ChartDrilldownPayload | null
  query: string | null
  status: DrilldownRuntimeStatus
  response: string
  citations: EvidenceCitation[]
  error: string | null
  tasks: DrilldownTask[]
}

export const INITIAL_DRILLDOWN_STATE: DrilldownState = {
  open: false,
  runId: null,
  pointId: null,
  context: null,
  query: null,
  status: "idle",
  response: "",
  citations: [],
  error: null,
  tasks: [],
}

function buildInitialTasks(): DrilldownTask[] {
  return [
    {
      id: "drilldown-retrieve",
      label: "Deep-Dive Evidence",
      status: "running",
      detail: "Collecting trial-level signal for the selected datapoint.",
    },
    {
      id: "drilldown-appraise",
      label: "Trial Appraisal",
      status: "pending",
      detail: "Ranking evidence quality and consistency.",
    },
    {
      id: "drilldown-synthesize",
      label: "Focused Synthesis",
      status: "pending",
      detail: "Generating clinical interpretation with citations.",
    },
  ]
}

function tasksForPhase(
  tasks: DrilldownTask[],
  phase: "retrieving" | "appraising" | "synthesizing"
): DrilldownTask[] {
  if (tasks.length === 0) return tasks
  return tasks.map((task) => {
    if (phase === "retrieving") {
      if (task.id === "drilldown-retrieve") return { ...task, status: "running" }
      return { ...task, status: "pending" }
    }
    if (phase === "appraising") {
      if (task.id === "drilldown-retrieve") return { ...task, status: "completed" }
      if (task.id === "drilldown-appraise") return { ...task, status: "running" }
      return { ...task, status: "pending" }
    }
    if (task.id === "drilldown-retrieve") return { ...task, status: "completed" }
    if (task.id === "drilldown-appraise") return { ...task, status: "completed" }
    if (task.id === "drilldown-synthesize") return { ...task, status: "running" }
    return task
  })
}

function completeAllTasks(tasks: DrilldownTask[]): DrilldownTask[] {
  return tasks.map((task) => ({ ...task, status: "completed" }))
}

function failActiveTasks(tasks: DrilldownTask[]): DrilldownTask[] {
  let failedOne = false
  return tasks.map((task) => {
    if (task.status === "running" && !failedOne) {
      failedOne = true
      return { ...task, status: "failed" }
    }
    if (task.status === "pending" && !failedOne) {
      failedOne = true
      return { ...task, status: "failed" }
    }
    return task
  })
}

export type DrilldownAction =
  | {
      type: "SET_DRILLDOWN_CONTEXT"
      payload: {
        runId: string
        pointId: string
        context: ChartDrilldownPayload
        query: string
      }
    }
  | {
      type: "HYDRATE_DRILLDOWN_CACHE"
      payload: {
        runId: string
        pointId: string
        context: ChartDrilldownPayload
        query: string
        response: string
        citations: EvidenceCitation[]
      }
    }
  | {
      type: "SET_DRILLDOWN_PHASE"
      payload: {
        phase: "retrieving" | "appraising" | "synthesizing"
      }
    }
  | {
      type: "SET_DRILLDOWN_RESULT"
      payload: {
        response: string
        citations: EvidenceCitation[]
      }
    }
  | {
      type: "SET_DRILLDOWN_ERROR"
      payload: {
        error: string
      }
    }
  | {
      type: "CLOSE_DRILLDOWN_PANEL"
    }
  | {
      type: "CLEAR_DRILLDOWN"
    }

export function drilldownStateReducer(
  state: DrilldownState,
  action: DrilldownAction
): DrilldownState {
  if (action.type === "SET_DRILLDOWN_CONTEXT") {
    return {
      open: true,
      runId: action.payload.runId,
      pointId: action.payload.pointId,
      context: action.payload.context,
      query: action.payload.query,
      status: "running",
      response: "",
      citations: [],
      error: null,
      tasks: buildInitialTasks(),
    }
  }

  if (action.type === "HYDRATE_DRILLDOWN_CACHE") {
    return {
      open: true,
      runId: action.payload.runId,
      pointId: action.payload.pointId,
      context: action.payload.context,
      query: action.payload.query,
      status: "ready",
      response: action.payload.response,
      citations: action.payload.citations,
      error: null,
      tasks: completeAllTasks(buildInitialTasks()),
    }
  }

  if (action.type === "SET_DRILLDOWN_PHASE") {
    return {
      ...state,
      status: "running",
      tasks: tasksForPhase(state.tasks, action.payload.phase),
    }
  }

  if (action.type === "SET_DRILLDOWN_RESULT") {
    return {
      ...state,
      status: "ready",
      response: action.payload.response,
      citations: action.payload.citations,
      error: null,
      tasks: completeAllTasks(state.tasks),
    }
  }

  if (action.type === "SET_DRILLDOWN_ERROR") {
    return {
      ...state,
      status: "error",
      error: action.payload.error,
      tasks: failActiveTasks(state.tasks),
    }
  }

  if (action.type === "CLOSE_DRILLDOWN_PANEL") {
    return {
      ...state,
      open: false,
    }
  }

  if (action.type === "CLEAR_DRILLDOWN") {
    return INITIAL_DRILLDOWN_STATE
  }

  return state
}
