"use client"

import { useCallback, useMemo, useState } from "react"
import { searchCommands, getCommandByTrigger, type SlashCommand } from "./command-registry"

interface UseCommandBarOptions {
  hasPatient: boolean
  /** Doctor/medical-student clinical chat: hide admin/navigation slash commands */
  clinicalCopilot?: boolean
  onCommandAction: (command: SlashCommand, args: string) => void
}

export function useCommandBar({
  hasPatient,
  clinicalCopilot = false,
  onCommandAction,
}: UseCommandBarOptions) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [query, setQuery] = useState("")
  const [activeChip, setActiveChip] = useState<SlashCommand | null>(null)

  const results = useMemo(
    () => searchCommands(query, hasPatient, { clinicalCopilot }),
    [query, hasPatient, clinicalCopilot]
  )

  const parseSlashInput = useCallback(
    (input: string): { isSlash: boolean; trigger: string; args: string } => {
      const trimmed = input.replace(/^\s+/, "")
      if (!trimmed.startsWith("/")) return { isSlash: false, trigger: "", args: "" }

      const firstLine = trimmed.split("\n")[0] || ""
      const parts = firstLine.split(/\s+/)
      const trigger = parts[0] || "/"
      const args = parts.slice(1).join(" ")
      return { isSlash: true, trigger, args }
    },
    []
  )

  const handleInputChange = useCallback(
    (value: string) => {
      if (activeChip) return

      const { isSlash, trigger } = parseSlashInput(value)
      if (isSlash) {
        const q = trigger.replace(/^\//, "")
        setQuery(q)
        setIsOpen(true)
        setSelectedIndex(0)
      } else {
        setIsOpen(false)
        setQuery("")
      }
    },
    [parseSlashInput, activeChip]
  )

  const handleSelect = useCallback(
    (command: SlashCommand, _inputValue: string) => {
      setIsOpen(false)
      setQuery("")
      setActiveChip(command)
    },
    []
  )

  const executeChip = useCallback(
    (args: string) => {
      if (!activeChip) return
      onCommandAction(activeChip, args)
      setActiveChip(null)
    },
    [activeChip, onCommandAction]
  )

  const clearChip = useCallback(() => {
    setActiveChip(null)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, inputValue: string): boolean => {
      if (activeChip) {
        if (e.key === "Backspace" && !inputValue) {
          e.preventDefault()
          clearChip()
          return true
        }
        if (e.key === "Escape") {
          e.preventDefault()
          clearChip()
          return true
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          executeChip(inputValue)
          return true
        }
        return false
      }

      if (!isOpen) return false

      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1 >= results.length ? 0 : prev + 1))
        return true
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 < 0 ? results.length - 1 : prev - 1))
        return true
      }
      if (e.key === "Enter" && !e.shiftKey) {
        const selected = results[selectedIndex]
        if (selected) {
          e.preventDefault()
          handleSelect(selected, inputValue)
          return true
        }
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setIsOpen(false)
        return true
      }
      if (e.key === "Tab") {
        const selected = results[selectedIndex]
        if (selected) {
          e.preventDefault()
          handleSelect(selected, inputValue)
          return true
        }
      }
      return false
    },
    [activeChip, clearChip, executeChip, isOpen, results, selectedIndex, handleSelect]
  )

  return {
    isOpen,
    results,
    selectedIndex,
    query,
    activeChip,
    setIsOpen,
    handleInputChange,
    handleSelect,
    handleKeyDown,
    parseSlashInput,
    executeChip,
    clearChip,
  }
}
