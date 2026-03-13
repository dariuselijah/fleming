import { addUTM } from "@/app/components/chat/utils"
import { ModelConfig } from "@/lib/models/types"
import { PROVIDERS } from "@/lib/providers"
import {
  ArrowSquareOutIcon,
  BrainIcon,
  CheckCircleIcon,
  GlobeIcon,
  ImageIcon,
  WrenchIcon,
} from "@phosphor-icons/react"

type SubMenuProps = {
  hoveredModelData: ModelConfig
}

export function SubMenu({ hoveredModelData }: SubMenuProps) {
  const provider = PROVIDERS.find(
    (provider) => provider.id === hoveredModelData.icon
  )
  const responseSpeed = hoveredModelData.speed || "Medium"
  const useCases =
    hoveredModelData.useCases && hoveredModelData.useCases.length > 0
      ? hoveredModelData.useCases
      : hoveredModelData.tags?.slice(0, 3) || []
  const benchmarkRows = hoveredModelData.healthcareBenchmarks?.slice(0, 3) || []
  const verifiedBenchmarks = hoveredModelData.verifiedBenchmarks?.slice(0, 3) || []
  const displayName =
    hoveredModelData.id === "claude-sonnet-4-6"
      ? "Claude Sonnet"
      : hoveredModelData.id === "gemini-2.5-flash"
        ? "Gemini 2.5 Fast"
        : hoveredModelData.name

  return (
    <div className="bg-popover border-border w-[300px] max-h-[calc(100dvh-10rem)] overflow-y-auto overscroll-contain rounded-xl border p-3.5 shadow-lg">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {provider?.icon && <provider.icon className="size-5" />}
          <h3 className="font-medium">{displayName}</h3>
        </div>

        <p className="text-muted-foreground text-sm">
          {hoveredModelData.description}
        </p>

        {verifiedBenchmarks.length > 0 ? (
          <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/70 p-2.5 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="mb-2 flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircleIcon className="size-3.5" />
              <span>Verified Performance</span>
            </div>
            <div className="space-y-1.5 text-emerald-900 dark:text-emerald-100">
              {verifiedBenchmarks.map((row) => (
                <div key={`${row.label}-${row.value}`} className="rounded-md bg-white/70 px-2 py-1 dark:bg-emerald-950/30">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{row.label}</span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              {Array.from(
                new Map(
                  verifiedBenchmarks.map((row) => [row.sourceUrl, row.source])
                ).entries()
              ).map(([sourceUrl, source]) => (
                <a
                  key={sourceUrl}
                  href={addUTM(sourceUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  {source}
                  <ArrowSquareOutIcon className="size-3" />
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {benchmarkRows.length > 0 ? (
          <div className="text-muted-foreground rounded-md border p-2 text-xs">
            <div className="mb-1 font-medium">Healthcare fit</div>
            <div>{benchmarkRows.join(" • ")}</div>
          </div>
        ) : null}

        {useCases.length > 0 ? (
          <div className="text-muted-foreground rounded-md border p-2 text-xs">
            <div className="mb-1 font-medium">Best for</div>
            <div>{useCases.join(" • ")}</div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <div className="mt-1 flex flex-wrap gap-2">
            {hoveredModelData.vision && (
              <div className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-800 dark:text-green-100">
                <ImageIcon className="size-3" />
                <span>Vision</span>
              </div>
            )}

            {hoveredModelData.tools && (
              <div className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-800 dark:text-purple-100">
                <WrenchIcon className="size-3" />
                <span>Tools</span>
              </div>
            )}

            {hoveredModelData.reasoning && (
              <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-800 dark:text-amber-100">
                <BrainIcon className="size-3" />
                <span>Reasoning</span>
              </div>
            )}

            {hoveredModelData.webSearch && (
              <div className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-800 dark:text-blue-100">
                <GlobeIcon className="size-3" />
                <span>Web Search</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">Context</span>
            <span>
              {Intl.NumberFormat("en-US", {
                style: "decimal",
              }).format(hoveredModelData.contextWindow ?? 0)}{" "}
              tokens
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">Response time</span>
            <span>{responseSpeed}</span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">Input Pricing</span>
              <span>
                {Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(hoveredModelData.inputCost ?? 0)}{" "}
                / 1M tokens
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">Output Pricing</span>
              <span>
                {Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(hoveredModelData.outputCost ?? 0)}{" "}
                / 1M tokens
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">Provider</span>
            <span>{hoveredModelData.provider}</span>
          </div>

          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex-1 font-medium">Id</span>
            <span className="text-muted-foreground truncate text-xs">
              {String(hoveredModelData.id)}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <a
              href={addUTM(hoveredModelData.apiDocs ?? "")}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5"
            >
              <span className="">API Docs</span>
              <ArrowSquareOutIcon className="size-3" />
            </a>
            <a
              href={addUTM(hoveredModelData.modelPage ?? "")}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5"
            >
              <span className="">Model Page</span>
              <ArrowSquareOutIcon className="size-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
