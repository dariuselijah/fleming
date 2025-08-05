"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
  grok4: "grok-4", // Grok-4 model
  grok3: "grok-3", // Grok-3 model
  o3: "o3", // o3 model
  gpt4o: "gpt-4o", // GPT-4o model
} as const

type ModalMode = keyof typeof MODAL_MAPPING

// Helper function to get the actual model ID from modal mode
const getActualModelId = (modalMode: string): string => {
  return MODAL_MAPPING[modalMode as ModalMode] || modalMode
}

// Helper function to get modal mode from actual model ID
const getModalModeFromModelId = (modelId: string): string => {
  const entry = Object.entries(MODAL_MAPPING).find(([_, actualId]) => actualId === modelId)
  return entry ? entry[0] : "grok4" // Default to grok4 if no match found
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
  const [isButtonDisabled, setIsButtonDisabled] = useState(true);
  
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
  const isOnlyWhitespace = (text: string | undefined | null) => {
    if (!text) return true
    return !/[^\s]/.test(text)
  }

  // Handle modal mode selection
  const handleModalModeChange = useCallback((modalMode: string) => {
    const actualModelId = getActualModelId(modalMode)
    onSelectModel(actualModelId)
  }, [onSelectModel])

  // Get the current modal mode for display - ensure it has a default value
  const currentModalMode = useMemo(() => {
    const mode = getModalModeFromModelId(selectedModel)
    return mode || "grok4" // Ensure we always have a valid mode
  }, [selectedModel])

  const handleSend = useCallback(() => {
    console.log("=== handleSend CALLED (button click) ===")
    console.log("Current isSubmitting state:", isSubmitting)
    console.log("Current status:", status)
    
    if (isSubmitting) {
      console.log("Already submitting, ignoring button click")
      return
    }

    if (status === "streaming") {
      console.log("Streaming, stopping")
      stop()
      return
    }

    console.log("Calling onSend from button click")
    onSend()
  }, [isSubmitting, onSend, status, stop])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      console.log("=== handleKeyDown CALLED ===")
      console.log("Key pressed:", e.key)
      console.log("Current isSubmitting state:", isSubmitting)
      console.log("Current status:", status)
      
      if (isSubmitting) {
        console.log("Already submitting, preventing key event")
        e.preventDefault()
        return
      }

      if (e.key === "Enter" && status === "streaming") {
        console.log("Streaming, preventing Enter key")
        e.preventDefault()
        return
      }

      if (e.key === "Enter" && !e.shiftKey) {
        if (!value || isOnlyWhitespace(value)) {
          console.log("Empty value or whitespace, ignoring Enter key")
          return
        }

        console.log("=== handleKeyDown CALLED (Enter key) ===")
        e.preventDefault()
        console.log("Calling onSend from Enter key")
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

  useEffect(() => {
    setIsButtonDisabled(Boolean(!value || isSubmitting || (value && isOnlyWhitespace(value))));
  }, [value, isSubmitting]);

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
            placeholder="Ask Fleming anything..."
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="min-h-[44px] pt-3 pl-4 text-base leading-[1.3] sm:text-base md:text-base placeholder:text-muted-foreground placeholder:opacity-80"
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
                      {label === 'grok4' ? 'Grok-4' : label === 'grok3' ? 'Grok-3' : label === 'o3' ? 'o3' : 'GPT-4o'}
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
                disabled={isButtonDisabled}
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
