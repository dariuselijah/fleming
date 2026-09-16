import { create } from "zustand"

type AssistantState = {
  /** Main input pill visible (false = collapsed mini chip). */
  pillOpen: boolean
  historyOpen: boolean
  focused: boolean
  setPillOpen: (v: boolean) => void
  setHistoryOpen: (v: boolean) => void
  setFocused: (v: boolean) => void
  toggleHistory: () => void
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  pillOpen: true,
  historyOpen: false,
  focused: false,
  setPillOpen: (pillOpen) => set({ pillOpen }),
  setHistoryOpen: (historyOpen) => set({ historyOpen }),
  setFocused: (focused) => set({ focused }),
  toggleHistory: () => set({ historyOpen: !get().historyOpen }),
}))
