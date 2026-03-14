"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckIcon, PlusIcon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useMemo, useState } from "react"

type ConnectorItem = {
  id: string
  name: string
  description: string
  domain: string
  isFeatured: boolean
  isAvailable?: boolean
}

const CONNECTORS: ConnectorItem[] = [
  {
    id: "pubmed",
    name: "PubMed",
    description: "Search biomedical literature from PubMed",
    domain: "pubmed.ncbi.nlm.nih.gov",
    isFeatured: true,
  },
  {
    id: "scholar_gateway",
    name: "Scholar Gateway",
    description: "Enhance responses with scholarly research and citations",
    domain: "scholar.google.com",
    isFeatured: false,
  },
  {
    id: "clinical_trials",
    name: "Clinical Trials",
    description: "Access ClinicalTrials.gov data",
    domain: "clinicaltrials.gov",
    isFeatured: false,
  },
  {
    id: "biorxiv",
    name: "bioRxiv",
    description: "Access bioRxiv and medRxiv preprint data",
    domain: "biorxiv.org",
    isFeatured: false,
  },
  {
    id: "biorender",
    name: "BioRender",
    description: "Temporarily unavailable (pending official API support)",
    domain: "biorender.com",
    isFeatured: false,
    isAvailable: false,
  },
  {
    id: "npi_registry",
    name: "NPI Registry",
    description: "Access US National Provider Identifier (NPI) Registry",
    domain: "npiregistry.cms.hhs.gov",
    isFeatured: false,
  },
  {
    id: "synapse",
    name: "Synapse.org",
    description: "Temporarily unavailable (requires Synapse access token)",
    domain: "synapse.org",
    isFeatured: false,
    isAvailable: false,
  },
  {
    id: "cms_coverage",
    name: "CMS Coverage",
    description: "Access the CMS Coverage Database",
    domain: "cms.gov",
    isFeatured: true,
  },
  {
    id: "chembl",
    name: "ChEMBL",
    description: "Access the ChEMBL Database",
    domain: "ebi.ac.uk",
    isFeatured: true,
  },
  {
    id: "openfda",
    name: "OpenFDA",
    description: "Access FDA datasets for labels, events, and enforcement",
    domain: "open.fda.gov",
    isFeatured: true,
  },
  {
    id: "benchling",
    name: "Benchling",
    description: "Temporarily unavailable (requires Benchling API credentials)",
    domain: "benchling.com",
    isFeatured: false,
    isAvailable: false,
  },
]

type ConnectorCardProps = {
  connector: ConnectorItem
  isEnabled: boolean
  onToggleEnabled: (id: string) => void
}

function ConnectorCard({ connector, isEnabled, onToggleEnabled }: ConnectorCardProps) {
  const logoUrl = `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(
    `https://${connector.domain}`
  )}`

  const isAvailable = connector.isAvailable !== false

  return (
    <div className="bg-card border-border flex min-h-24 items-center justify-between rounded-xl border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="bg-background border-border flex size-9 shrink-0 items-center justify-center rounded-lg border">
          <img
            src={logoUrl}
            alt={`${connector.name} logo`}
            className="size-6 rounded-sm object-contain"
            loading="lazy"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-tight">
            {connector.name}
          </p>
          <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
            {connector.description}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant={isEnabled ? "secondary" : "outline"}
        size="icon"
        className={cn(
          "h-10 w-10 shrink-0 rounded-lg",
          isEnabled ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15" : ""
        )}
        aria-label={
          isAvailable
            ? `${isEnabled ? "Disable" : "Enable"} ${connector.name}`
            : `${connector.name} unavailable`
        }
        onClick={() => onToggleEnabled(connector.id)}
        disabled={!isAvailable}
      >
        {!isAvailable ? "-" : isEnabled ? <CheckIcon className="size-4" /> : <PlusIcon className="size-4" />}
      </Button>
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
          Unlock more with AskFleming when you connect with remote and local tools.
          Choose from AskFleming-reviewed tools.
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
