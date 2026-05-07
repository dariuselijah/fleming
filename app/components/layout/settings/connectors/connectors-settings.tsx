"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getHealthConnectorCatalog } from "@/lib/health-connectors/catalog"
import {
  getConnectorInitials,
  getConnectorLogoSrc,
} from "@/lib/health-connectors/branding"
import type {
  HealthConnectorAvailability,
  HealthConnectorCategory,
  HealthConnectorDefinition,
} from "@/lib/health-connectors/types"
import { cn } from "@/lib/utils"
import { CheckIcon, PlusIcon } from "@phosphor-icons/react"
import { useMemo, useState } from "react"

const CONNECTORS = getHealthConnectorCatalog()

function availabilityBadgeVariant(
  availability: HealthConnectorAvailability
): "default" | "secondary" | "outline" {
  if (availability === "live") return "default"
  if (availability === "beta") return "secondary"
  return "outline"
}

function availabilityLabel(availability: HealthConnectorAvailability): string {
  if (availability === "live") return "Live"
  if (availability === "beta") return "Beta"
  return "Coming soon"
}

function categoryLabel(category: HealthConnectorCategory): string {
  if (category === "medical_records") return "Medical records"
  if (category === "native_mobile") return "Native"
  if (category === "wearable") return "Wearable"
  return "Evidence"
}

type ConnectorCardProps = {
  connector: HealthConnectorDefinition
  isEnabled: boolean
  onToggleEnabled: (id: string) => void
}

function ConnectorCard({ connector, isEnabled, onToggleEnabled }: ConnectorCardProps) {
  const isComingSoon = connector.availability === "coming_soon"
  const isEvidenceConnector = connector.category === "evidence"

  return (
    <div className="bg-card border-border flex min-h-24 items-center justify-between rounded-xl border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="bg-background border-border flex size-9 shrink-0 items-center justify-center rounded-lg border">
          <Avatar className="size-6 rounded-md">
            <AvatarImage src={getConnectorLogoSrc(connector)} alt={`${connector.name} logo`} />
            <AvatarFallback className="text-[10px] font-semibold">
              {getConnectorInitials(connector.name)}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-tight">
            {connector.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={availabilityBadgeVariant(connector.availability)}>
              {availabilityLabel(connector.availability)}
            </Badge>
            <Badge variant="outline">{categoryLabel(connector.category)}</Badge>
          </div>
          <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
            {connector.description}
            {connector.availability === "coming_soon" && connector.comingSoonReason
              ? ` ${connector.comingSoonReason}`
              : ""}
          </p>
        </div>
      </div>
      {isComingSoon ? (
        <Button type="button" variant="outline" size="sm" className="shrink-0" disabled>
          Soon
        </Button>
      ) : isEvidenceConnector ? (
        <Button
          type="button"
          variant={isEnabled ? "secondary" : "outline"}
          size="icon"
          className={cn(
            "h-10 w-10 shrink-0 rounded-lg",
            isEnabled ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15" : ""
          )}
          aria-label={`${isEnabled ? "Disable" : "Enable"} ${connector.name}`}
          onClick={() => onToggleEnabled(connector.id)}
        >
          {isEnabled ? <CheckIcon className="size-4" /> : <PlusIcon className="size-4" />}
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" className="shrink-0" disabled>
          Soon
        </Button>
      )}
    </div>
  )
}

export function ConnectorsSettings() {
  const [activeTab, setActiveTab] = useState<"featured" | "all">("featured")
  const [searchQuery, setSearchQuery] = useState("")
  const [enabledById, setEnabledById] = useState<Record<string, boolean>>(
    () =>
      CONNECTORS.reduce<Record<string, boolean>>((acc, connector) => {
        acc[connector.id] = true
        return acc
      }, {})
  )

  const visibleConnectors = useMemo(() => {
    const base =
      activeTab === "featured"
        ? CONNECTORS.filter((connector) => connector.isFeatured)
        : CONNECTORS

    const query = searchQuery.trim().toLowerCase()
    if (!query) return base

    return base.filter((connector) =>
      `${connector.name} ${connector.description}`.toLowerCase().includes(query)
    )
  }, [activeTab, searchQuery])

  const handleToggleEnabled = (id: string) => {
    setEnabledById((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <section className="space-y-5 pb-4">
      <div>
        <h3 className="text-3xl font-semibold tracking-tight">Connectors</h3>
        <p className="text-muted-foreground mt-2 max-w-3xl text-base leading-relaxed">
          Manage evidence, wearable, and medical-record integrations in one place.
          Native connectors are marked as coming soon until their mobile bridge is released.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-6 border-b pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("featured")}
            className={cn(
              "border-b-2 pb-2 text-lg font-medium transition-colors",
              activeTab === "featured"
                ? "border-foreground text-foreground"
                : "text-muted-foreground border-transparent"
            )}
          >
            Featured
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={cn(
              "border-b-2 pb-2 text-lg font-medium transition-colors",
              activeTab === "all"
                ? "border-foreground text-foreground"
                : "text-muted-foreground border-transparent"
            )}
          >
            All
          </button>
        </div>

        <div className="max-w-[480px]">
          <Input
            placeholder="Search"
            className="h-10 rounded-xl text-sm"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {visibleConnectors.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              isEnabled={enabledById[connector.id] ?? true}
              onToggleEnabled={handleToggleEnabled}
            />
          ))}
        </div>

        {visibleConnectors.length === 0 && (
          <p className="text-muted-foreground py-4 text-sm">
            No connectors match your search.
          </p>
        )}
      </div>
    </section>
  )
}
