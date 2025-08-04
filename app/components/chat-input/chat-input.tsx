"use client"

import { useCallback, useMemo } from "react"
import { ArrowUpIcon, StopIcon } from "@phosphor-icons/react"
import { getModelInfo } from "@/lib/models"
import { useModel } from "@/lib/model-store/provider"
import { ModelSelector } from "@/components/common/model-selector/base"
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input"
import { Button } from "@/components/ui/button"
import { PromptSystem } from "../suggestions/prompt-system"
import { ButtonFileUpload } from "./button-file-upload"
import { ButtonSearch } from "./button-search"
import { FileList } from "./file-list"
import { Select } from "@/components/ui/select"
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Multi-modal configuration - maps user-friendly labels to actual model IDs
const MODAL_MAPPING = {
  normal: "gpt-4.1-nano", // Normal mode maps to GPT-4.1 Nano
  expert: "gpt-4.1", // Expert mode maps to GPT-4.1
} as const

type ModalMode = keyof typeof MODAL_MAPPING

// Helper function to get the actual model ID from modal mode
const getActualModelId = (modalMode: string): string => {
  return MODAL_MAPPING[modalMode as ModalMode] || modalMode
}

// Helper function to get modal mode from actual model ID
const getModalModeFromModelId = (modelId: string): string => {
  const entry = Object.entries(MODAL_MAPPING).find(([_, actualId]) => actualId === modelId)
  return entry ? entry[0] : modelId
}

type ChatInputProps = {
  value: string
  onValueChange: (value: string) => void
  onSend: () => void
  isSubmitting?: boolean
  hasMessages?: boolean
  files: File[]
  onFileUpload: (files: File[]) => void
  onFileRemove: (file: File) => void
  onSuggestion: (suggestion: string) => void
  hasSuggestions?: boolean
  onSelectModel: (model: string) => void
  selectedModel: string
  isUserAuthenticated: boolean
  stop: () => void
  status?: "submitted" | "streaming" | "ready" | "error"
  setEnableSearch: (enabled: boolean) => void
  enableSearch: boolean
}

export function ChatInput({
  value,
  onValueChange,
  onSend,
  isSubmitting,
  files,
  onFileUpload,
  onFileRemove,
  onSuggestion,
  hasSuggestions,
  onSelectModel,
  selectedModel,
  isUserAuthenticated,
  stop,
  status,
  setEnableSearch,
  enableSearch,
}: ChatInputProps) {
  const { models } = useModel()
  
  // Get the actual model ID for the selected modal mode
  const actualModelId = getActualModelId(selectedModel)

  // Validate that the mapped models exist in available models
  const availableModalModes = useMemo(() => {
    return Object.entries(MODAL_MAPPING).filter(([_, modelId]) => 
      models.some(model => model.id === modelId)
    )
  }, [models])

  // Fallback to first available model if current model is not available
  const effectiveModelId = useMemo(() => {
    if (availableModalModes.length === 0) {
      return models[0]?.id || selectedModel
    }
    return actualModelId
  }, [availableModalModes.length, actualModelId, models, selectedModel])

  const selectModelConfig = getModelInfo(effectiveModelId)
  const hasSearchSupport = Boolean(selectModelConfig?.webSearch)
  const isOnlyWhitespace = (text: string) => !/[^\s]/.test(text)

  // Handle modal mode selection
  const handleModalModeChange = useCallback((modalMode: string) => {
    const actualModelId = getActualModelId(modalMode)
    onSelectModel(actualModelId)
  }, [onSelectModel])

  // Get the current modal mode for display
  const currentModalMode = getModalModeFromModelId(selectedModel)

  const handleSend = useCallback(() => {
    if (isSubmitting) {
      return
    }

    if (status === "streaming") {
      stop()
      return
    }

    onSend()
  }, [isSubmitting, onSend, status, stop])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isSubmitting) {
        e.preventDefault()
        return
      }

      if (e.key === "Enter" && status === "streaming") {
        e.preventDefault()
        return
      }

      if (e.key === "Enter" && !e.shiftKey) {
        if (isOnlyWhitespace(value)) {
          return
        }

        e.preventDefault()
        onSend()
      }
    },
    [isSubmitting, onSend, status, value]
  )

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      const hasImageContent = Array.from(items).some((item) =>
        item.type.startsWith("image/")
      )

      if (!isUserAuthenticated && hasImageContent) {
        e.preventDefault()
        return
      }

      if (isUserAuthenticated && hasImageContent) {
        const imageFiles: File[] = []

        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile()
            if (file) {
              const newFile = new File(
                [file],
                `pasted-image-${Date.now()}.${file.type.split("/")[1]}`,
                { type: file.type }
              )
              imageFiles.push(newFile)
            }
          }
        }

        if (imageFiles.length > 0) {
          onFileUpload(imageFiles)
        }
      }
    },
    [isUserAuthenticated, onFileUpload]
  )

  useMemo(() => {
    if (!hasSearchSupport && enableSearch) {
      setEnableSearch?.(false)
    }
  }, [hasSearchSupport, enableSearch, setEnableSearch])

  return (
    <div className="relative flex w-full flex-col gap-4">
      {hasSuggestions && (
        <PromptSystem
          onValueChange={onValueChange}
          onSuggestion={onSuggestion}
          value={value}
        />
      )}
      <div className="relative order-2 px-2 pb-3 sm:pb-4 md:order-1">
        <PromptInput
          className="bg-popover relative z-10 p-0 pt-1 shadow-xs backdrop-blur-xl"
          maxHeight={200}
          value={value}
          onValueChange={onValueChange}
        >
          <FileList files={files} onFileRemove={onFileRemove} />
          <PromptInputTextarea
            placeholder="Ask Fleming"
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="min-h-[44px] pt-3 pl-4 text-base leading-[1.3] sm:text-base md:text-base"
          />
          <PromptInputActions className="mt-5 w-full justify-between px-3 pb-3">
            <div className="flex gap-2">
              <ButtonFileUpload
                onFileUpload={onFileUpload}
                isUserAuthenticated={isUserAuthenticated}
                model={effectiveModelId}
              />
              <Select onValueChange={handleModalModeChange} value={currentModalMode}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                                  <SelectContent>
                   {availableModalModes.map(([label, modelId]) => (
                     <SelectItem key={modelId} value={label}>
                       {label === 'normal' ? 'Normal (Medical Assistant)' : 'Health Expert'}
                     </SelectItem>
                   ))}
                 </SelectContent>
              </Select>
              {hasSearchSupport ? (
                <ButtonSearch
                  isSelected={enableSearch}
                  onToggle={setEnableSearch}
                  isAuthenticated={isUserAuthenticated}
                />
              ) : null}
            </div>
            <PromptInputAction tooltip={status === "streaming" ? "Stop" : "Send"}>
              <Button
                size="sm"
                className="size-9 rounded-full transition-all duration-300 ease-out"
                disabled={!value || isSubmitting || isOnlyWhitespace(value)}
                type="button"
                onClick={handleSend}
                aria-label={status === "streaming" ? "Stop" : "Send message"}
              >
                {status === "streaming" ? (
                  <StopIcon className="size-4" />
                ) : (
                  <ArrowUpIcon className="size-4" />
                )}
              </Button>
            </PromptInputAction>
          </PromptInputActions>
        </PromptInput>
      </div>
    </div>
  )
}
