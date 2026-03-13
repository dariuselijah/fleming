"use client"

import { PopoverContentAuth } from "@/app/components/chat-input/popover-content-auth"
import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { useKeyShortcut } from "@/app/hooks/use-key-shortcut"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useModel } from "@/lib/model-store/provider"
import { ModelConfig } from "@/lib/models/types"
import { PROVIDERS } from "@/lib/providers"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { cn } from "@/lib/utils"
import {
  CaretDownIcon,
  MagnifyingGlassIcon,
  StarIcon,
} from "@phosphor-icons/react"
import { useMemo, useRef, useState } from "react"
import { ProModelDialog } from "./pro-dialog"
import { SubMenu } from "./sub-menu"

const AUTO_MODEL_ID = "gpt-5.2"
const POPULAR_MODEL_IDS = ["claude-sonnet-4-6", "gpt-5.2", "gemini-2.5-flash"] as const
const LATEST_MODEL_IDS = [
  "grok-4-1-fast-reasoning",
  "gpt-5.4",
  "claude-opus-4-6",
  "gemini-2.5-pro",
] as const
const CURATED_MODEL_IDS = [
  AUTO_MODEL_ID,
  ...POPULAR_MODEL_IDS,
  ...LATEST_MODEL_IDS,
] as const
const MODEL_LABEL_OVERRIDES: Record<string, string> = {
  "claude-sonnet-4-6": "Claude Sonnet",
  "gemini-2.5-flash": "Gemini 2.5 Fast",
}

type ModelSelectorProps = {
  selectedModelId: string
  setSelectedModelId: (modelId: string) => void
  className?: string
  isUserAuthenticated?: boolean
}

export function ModelSelector({
  selectedModelId,
  setSelectedModelId,
  className,
  isUserAuthenticated = true,
}: ModelSelectorProps) {
  const { models, isLoading: isLoadingModels } = useModel()
  const { isModelHidden } = useUserPreferences()

  const currentModel = models.find((model) => model.id === selectedModelId)
  const currentProvider = PROVIDERS.find(
    (provider) => provider.id === currentModel?.icon
  )
  const isMobile = useBreakpoint(768)
  const [hoveredModel, setHoveredModel] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isProDialogOpen, setIsProDialogOpen] = useState(false)
  const [selectedProModel, setSelectedProModel] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const getDisplayModelName = (
    model: ModelConfig,
    section: "auto" | "default" = "default"
  ) => (section === "auto" ? "Auto" : MODEL_LABEL_OVERRIDES[model.id] ?? model.name)

  // Ref for input to maintain focus
  const searchInputRef = useRef<HTMLInputElement>(null)

  useKeyShortcut(
    (e) => (e.key === "p" || e.key === "P") && e.metaKey && e.shiftKey,
    () => {
      if (isMobile) {
        setIsDrawerOpen((prev) => !prev)
      } else {
        setIsDropdownOpen((prev) => !prev)
      }
    }
  )

  const renderModelItem = (
    model: ModelConfig,
    section: "auto" | "default" = "default"
  ) => {
    const isLocked = !model.accessible
    const provider = PROVIDERS.find((provider) => provider.id === model.icon)

    return (
      <div
        key={model.id}
        className={cn(
          "flex w-full items-center justify-between px-3 py-2",
          selectedModelId === model.id && "bg-accent"
        )}
        onClick={() => {
          if (isLocked) {
            setSelectedProModel(model.id)
            setIsProDialogOpen(true)
            return
          }

          setSelectedModelId(model.id)
          if (isMobile) {
            setIsDrawerOpen(false)
          } else {
            setIsDropdownOpen(false)
          }
        }}
      >
        <div className="flex items-center gap-3">
          {provider?.icon && <provider.icon className="size-5" />}
          <div className="flex flex-col gap-0">
            <span className="text-sm">{getDisplayModelName(model, section)}</span>
          </div>
        </div>
        {isLocked && (
          <div className="border-input bg-accent text-muted-foreground flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
            <StarIcon className="size-2" />
            <span>Locked</span>
          </div>
        )}
      </div>
    )
  }

  const frontierModels = models.filter((model) => {
    if (!["xai", "openai", "google", "anthropic"].includes(model.providerId)) {
      return false
    }
    if (!CURATED_MODEL_IDS.includes(model.id as (typeof CURATED_MODEL_IDS)[number])) {
      return false
    }
    return !isModelHidden(model.id)
  })

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredModels = useMemo(() => {
    if (!normalizedQuery) return frontierModels
    return frontierModels.filter((model) => {
      const displayName = getDisplayModelName(model).toLowerCase()
      const providerName = String(model.provider ?? "").toLowerCase()
      return (
        displayName.includes(normalizedQuery) ||
        model.id.toLowerCase().includes(normalizedQuery) ||
        providerName.includes(normalizedQuery)
      )
    })
  }, [frontierModels, normalizedQuery])

  const hoveredModelData = filteredModels.find((model) => model.id === hoveredModel)
  const modelsById = useMemo(
    () => new Map(filteredModels.map((model) => [model.id, model])),
    [filteredModels]
  )
  const sectionedModels = useMemo(
    () => ({
      auto: [modelsById.get(AUTO_MODEL_ID)].filter(Boolean) as ModelConfig[],
      popular: POPULAR_MODEL_IDS.map((id) => modelsById.get(id)).filter(
        Boolean
      ) as ModelConfig[],
      latest: LATEST_MODEL_IDS.map((id) => modelsById.get(id)).filter(
        Boolean
      ) as ModelConfig[],
    }),
    [modelsById]
  )

  const trigger = (
    <Button
      variant="outline"
      className={cn("bg-background border-border hover:bg-accent", className)}
      disabled={isLoadingModels}
    >
      <div className="flex items-center gap-2">
        {currentProvider?.icon && <currentProvider.icon className="size-5" />}
        <span>
          {currentModel
            ? currentModel.id === AUTO_MODEL_ID
              ? "Auto"
              : getDisplayModelName(currentModel)
            : "Select model"}
        </span>
      </div>
      <CaretDownIcon className="size-4 opacity-50" />
    </Button>
  )

  const renderSection = (
    title: string,
    sectionModels: ModelConfig[],
    section: "auto" | "default" = "default"
  ) => {
    if (sectionModels.length === 0) return null
    return (
      <div className="mb-2">
        <div className="text-muted-foreground sticky top-0 z-10 bg-inherit px-3 py-1 text-[11px] font-semibold tracking-wide uppercase">
          {title}
        </div>
        {sectionModels.map((model) => {
          const isLocked = !model.accessible
          const provider = PROVIDERS.find((provider) => provider.id === model.icon)

          return (
            <DropdownMenuItem
              key={model.id}
              className={cn(
                "hover:bg-accent/70 flex w-full items-center justify-between rounded-lg px-3 py-2 transition-colors",
                selectedModelId === model.id && "bg-accent"
              )}
              onSelect={() => {
                if (isLocked) {
                  setSelectedProModel(model.id)
                  setIsProDialogOpen(true)
                  return
                }

                setSelectedModelId(model.id)
                setIsDropdownOpen(false)
              }}
              onFocus={() => {
                if (isDropdownOpen) {
                  setHoveredModel(model.id)
                }
              }}
              onMouseEnter={() => {
                if (isDropdownOpen) {
                  setHoveredModel(model.id)
                }
              }}
            >
              <div className="flex items-center gap-3">
                {provider?.icon && <provider.icon className="size-5" />}
                <div className="flex flex-col gap-0">
                  <span className="text-sm">{getDisplayModelName(model, section)}</span>
                </div>
              </div>
              {isLocked && (
                <div className="border-input bg-accent text-muted-foreground flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
                  <span>Locked</span>
                </div>
              )}
            </DropdownMenuItem>
          )
        })}
      </div>
    )
  }

  // Handle input change without losing focus
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    setSearchQuery(e.target.value)
  }

  // If user is not authenticated, show the auth popover
  if (!isUserAuthenticated) {
    return (
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                className={cn(
                  "border-border bg-background hover:bg-accent text-foreground h-9 w-auto border",
                  className
                )}
                type="button"
              >
                {currentProvider?.icon && (
                  <currentProvider.icon className="size-5" />
                )}
                {currentModel ? getDisplayModelName(currentModel) : "Select model"}
                <CaretDownIcon className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Select a model</TooltipContent>
        </Tooltip>
        <PopoverContentAuth />
      </Popover>
    )
  }

  if (isMobile) {
    return (
      <>
        <ProModelDialog
          isOpen={isProDialogOpen}
          setIsOpen={setIsProDialogOpen}
          currentModel={selectedProModel || ""}
        />
        <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Select Model</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-2">
              <div className="relative">
                <MagnifyingGlassIcon className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search models..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="flex h-full flex-col space-y-0 overflow-y-auto px-4 pb-6">
              {isLoadingModels ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <p className="text-muted-foreground mb-2 text-sm">
                    Loading models...
                  </p>
                </div>
              ) : filteredModels.length > 0 ? (
                <>
                  <div className="mb-2">
                    <div className="text-muted-foreground px-2 pb-1 text-[11px] font-semibold tracking-wide uppercase">
                      Auto
                    </div>
                    {sectionedModels.auto.map((model) =>
                      renderModelItem(model, "auto")
                    )}
                  </div>
                  <div className="mb-2">
                    <div className="text-muted-foreground px-2 pb-1 text-[11px] font-semibold tracking-wide uppercase">
                      Popular
                    </div>
                    {sectionedModels.popular.map((model) => renderModelItem(model))}
                  </div>
                  <div className="mb-1">
                    <div className="text-muted-foreground px-2 pb-1 text-[11px] font-semibold tracking-wide uppercase">
                      Latest
                    </div>
                    {sectionedModels.latest.map((model) => renderModelItem(model))}
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <p className="text-muted-foreground mb-2 text-sm">
                    No results found.
                  </p>
                  <a
                    href="https://github.com/ibelick/fleming/issues/new?title=Model%20Request%3A%20"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground text-sm underline"
                  >
                    Request a new model
                  </a>
                </div>
              )}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <div>
      <ProModelDialog
        isOpen={isProDialogOpen}
        setIsOpen={setIsProDialogOpen}
        currentModel={selectedProModel || ""}
      />
      <Tooltip>
        <DropdownMenu
          open={isDropdownOpen}
          onOpenChange={(open) => {
            setIsDropdownOpen(open)
            if (!open) {
              setHoveredModel(null)
              setSearchQuery("")
            } else {
              if (selectedModelId) setHoveredModel(selectedModelId)
            }
          }}
        >
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Switch model ⌘⇧P</TooltipContent>
          <DropdownMenuContent
            className="flex h-[330px] w-[320px] flex-col space-y-0.5 overflow-visible rounded-xl p-0"
            align="start"
            sideOffset={4}
            forceMount
            side="top"
          >
            <div className="bg-background sticky top-0 z-10 rounded-t-md border-b px-0 pt-0 pb-0">
              <div className="relative">
                <MagnifyingGlassIcon className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search models..."
                  className="bg-background rounded-b-none border border-none pl-8 shadow-none focus-visible:ring-0"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="flex h-full flex-col space-y-0 overflow-y-auto px-1 pt-0 pb-0">
              {isLoadingModels ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <p className="text-muted-foreground mb-2 text-sm">
                    Loading models...
                  </p>
                </div>
              ) : filteredModels.length > 0 ? (
                <>
                  {renderSection("Auto", sectionedModels.auto, "auto")}
                  {renderSection("Popular", sectionedModels.popular)}
                  {renderSection("Latest", sectionedModels.latest)}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <p className="text-muted-foreground mb-1 text-sm">
                    No results found.
                  </p>
                  <a
                    href="https://github.com/ibelick/fleming/issues/new?title=Model%20Request%3A%20"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground text-sm underline"
                  >
                    Request a new model
                  </a>
                </div>
              )}
            </div>

            {/* Submenu positioned absolutely */}
            {hoveredModelData && (
              <div className="absolute top-[calc(50%+48px)] left-[calc(100%+8px)] -translate-y-1/2">
                <SubMenu hoveredModelData={hoveredModelData} />
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </Tooltip>
    </div>
  )
}
