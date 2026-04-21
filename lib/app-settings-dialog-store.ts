import { create } from "zustand"

type AppSettingsDialogState = {
  open: boolean
  setOpen: (open: boolean) => void
  openSettings: () => void
}

export const useAppSettingsDialog = create<AppSettingsDialogState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  openSettings: () => set({ open: true }),
}))
