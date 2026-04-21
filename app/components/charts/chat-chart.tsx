"use client"

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type ChartKind = "line" | "bar" | "area" | "stacked-bar" | "composed"
type SeriesKind = "line" | "bar" | "area"

export type ChatChartSeries = {
  key: string
  label: string
  color?: string
  kind?: SeriesKind
  yAxisId?: "left" | "right"
  stackId?: string
}

export type ChatChartSpec = {
  type: ChartKind
  title?: string
  subtitle?: string
  source?: string
  xKey: string
  height?: number
  data: Array<Record<string, string | number | null>>
  series: ChatChartSeries[]
}

export type ChartDrilldownPayload = {
  chartTitle?: string
  chartType: ChartKind
  source?: string
  xKey: string
  xValue?: string | number
  seriesKey?: string
  seriesLabel?: string
  value?: string | number | null
}

const DEFAULT_SERIES_COLORS = [
  "#0E7C86",
  "#0FA3B1",
  "#9FCFD8",
  "#67D5C4",
  "#73BFD2",
]

function normalizedSeries(spec: ChatChartSpec): ChatChartSeries[] {
  return spec.series.map((series, index) => ({
    ...series,
    color: series.color || DEFAULT_SERIES_COLORS[index % DEFAULT_SERIES_COLORS.length],
  }))
}

function hasSecondAxis(series: ChatChartSeries[]) {
  return series.some((item) => item.yAxisId === "right")
}

function toSafeGradientId(key: string) {
  return key.replace(/[^a-zA-Z0-9_-]/g, "-")
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: string | number; color?: string }>
  label?: string | number
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-border/70 bg-background/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-sm">
      <p className="mb-1 font-medium text-foreground/90">{label}</p>
      <div className="space-y-0.5">
        {payload.map((item, index) => (
          <div key={`${item.name || "series"}-${index}`} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color || "currentColor" }}
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="font-medium">{item.value ?? "-"}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function renderChartContent(
  spec: ChatChartSpec,
  onDrilldown?: (payload: ChartDrilldownPayload) => void
) {
  const series = normalizedSeries(spec)
  const dualAxis = hasSecondAxis(series)
  const handleChartClick = (event: any) => {
    if (!onDrilldown || !event) return
    const activePayload = Array.isArray(event.activePayload) ? event.activePayload : []
    const primaryPayload = activePayload.find((item: unknown) => Boolean(item)) as
      | {
          payload?: Record<string, unknown>
          dataKey?: unknown
          name?: unknown
          value?: unknown
        }
      | undefined
    const point = primaryPayload?.payload
    const pointXValue = point?.[spec.xKey]
    const xValue =
      typeof event.activeLabel === "string" || typeof event.activeLabel === "number"
        ? event.activeLabel
        : typeof pointXValue === "string" || typeof pointXValue === "number"
          ? pointXValue
          : undefined
    const seriesKey =
      typeof primaryPayload?.dataKey === "string"
        ? primaryPayload.dataKey
        : undefined
    const seriesLabel =
      typeof primaryPayload?.name === "string" ? primaryPayload.name : undefined
    const value =
      typeof primaryPayload?.value === "string" ||
      typeof primaryPayload?.value === "number" ||
      primaryPayload?.value === null
        ? (primaryPayload.value as string | number | null)
        : undefined
    if (
      typeof xValue === "undefined" &&
      typeof seriesKey === "undefined" &&
      typeof value === "undefined"
    ) {
      return
    }
    onDrilldown({
      chartTitle: spec.title,
      chartType: spec.type,
      source: spec.source,
      xKey: spec.xKey,
      xValue,
      seriesKey,
      seriesLabel,
      value,
    })
  }

  if (spec.type === "line") {
    return (
      <LineChart data={spec.data} onClick={handleChartClick}>
        <defs>
          {series.map((item) => (
            <linearGradient
              key={item.key}
              id={`line-${toSafeGradientId(item.key)}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={item.color} stopOpacity={0.24} />
              <stop offset="100%" stopColor={item.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
        <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
        {dualAxis ? <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} /> : null}
        <Tooltip content={<ChartTooltip />} />
        <Legend />
        {series.map((item) => (
          <Line
            key={item.key}
            yAxisId={item.yAxisId || "left"}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    )
  }

  if (spec.type === "bar" || spec.type === "stacked-bar") {
    return (
      <BarChart data={spec.data} onClick={handleChartClick}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
        <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip content={<ChartTooltip />} />
        <Legend />
        {series.map((item) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.label}
            fill={item.color}
            radius={[4, 4, 0, 0]}
            stackId={spec.type === "stacked-bar" ? (item.stackId || "stack") : undefined}
          />
        ))}
      </BarChart>
    )
  }

  if (spec.type === "area") {
    return (
      <AreaChart data={spec.data} onClick={handleChartClick}>
        <defs>
          {series.map((item) => (
            <linearGradient
              key={item.key}
              id={`area-${toSafeGradientId(item.key)}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={item.color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={item.color} stopOpacity={0.03} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
        <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip content={<ChartTooltip />} />
        <Legend />
        {series.map((item) => (
          <Area
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            fill={`url(#area-${toSafeGradientId(item.key)})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    )
  }

  return (
    <ComposedChart data={spec.data} onClick={handleChartClick}>
      <defs>
        {series.map((item) => (
          <linearGradient
            key={item.key}
            id={`composed-${toSafeGradientId(item.key)}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={item.color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={item.color} stopOpacity={0.04} />
          </linearGradient>
        ))}
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
      <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} />
      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
      {dualAxis ? <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} /> : null}
      <Tooltip content={<ChartTooltip />} />
      <Legend />
      {series.map((item) => {
        const seriesKind = item.kind || "line"
        if (seriesKind === "bar") {
          return (
            <Bar
              key={item.key}
              yAxisId={item.yAxisId || "left"}
              dataKey={item.key}
              name={item.label}
              fill={item.color}
              radius={[4, 4, 0, 0]}
              stackId={item.stackId}
            />
          )
        }
        if (seriesKind === "area") {
          return (
            <Area
              key={item.key}
              yAxisId={item.yAxisId || "left"}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={item.color}
              fill={`url(#composed-${toSafeGradientId(item.key)})`}
              strokeWidth={2}
            />
          )
        }
        return (
          <Line
            key={item.key}
            yAxisId={item.yAxisId || "left"}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        )
      })}
    </ComposedChart>
  )
}

export function ChatChart({
  spec,
  className,
  onDrilldown,
}: {
  spec: ChatChartSpec
  className?: string
  onDrilldown?: (payload: ChartDrilldownPayload) => void
}) {
  const chartHeight = Math.max(220, Math.min(420, spec.height || 280))

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "rounded-2xl border border-border/70 bg-gradient-to-b from-background to-muted/20 p-4 shadow-sm",
        onDrilldown && "cursor-pointer",
        className
      )}
    >
      {spec.title ? <h4 className="text-base font-semibold">{spec.title}</h4> : null}
      {spec.subtitle ? <p className="text-muted-foreground mt-1 text-sm">{spec.subtitle}</p> : null}
      <div className="mt-3 w-full" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChartContent(spec, onDrilldown)}
        </ResponsiveContainer>
      </div>
      {onDrilldown ? (
        <p className="text-muted-foreground mt-2 text-[11px]">
          Click a data point to open drill-down analysis.
        </p>
      ) : null}
      {spec.source ? <p className="text-muted-foreground mt-2 text-xs">Source: {spec.source}</p> : null}
    </motion.div>
  )
}

function isValidSeries(series: unknown): series is ChatChartSeries[] {
  return Array.isArray(series) && series.every((item) => {
    if (!item || typeof item !== "object") return false
    const candidate = item as Record<string, unknown>
    return typeof candidate.key === "string" && typeof candidate.label === "string"
  })
}

function normalizeChartSpec(parsed: unknown): ChatChartSpec | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const candidate = parsed as Partial<ChatChartSpec>
  if (
    candidate.type !== "line" &&
    candidate.type !== "bar" &&
    candidate.type !== "area" &&
    candidate.type !== "stacked-bar" &&
    candidate.type !== "composed"
  ) {
    return null
  }
  if (typeof candidate.xKey !== "string") return null
  if (!Array.isArray(candidate.data)) return null
  if (!isValidSeries(candidate.series)) return null
  return {
    type: candidate.type,
    xKey: candidate.xKey,
    data: candidate.data as Array<Record<string, string | number | null>>,
    series: candidate.series,
    height: typeof candidate.height === "number" ? candidate.height : 280,
    title: typeof candidate.title === "string" ? candidate.title : undefined,
    subtitle: typeof candidate.subtitle === "string" ? candidate.subtitle : undefined,
    source: typeof candidate.source === "string" ? candidate.source : undefined,
  }
}

export function parseChartSpecs(raw: string): ChatChartSpec[] {
  const cleaned = raw.trim()
  if (!cleaned) return []
  try {
    const parsed = JSON.parse(cleaned) as unknown
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => normalizeChartSpec(entry))
        .filter((entry): entry is ChatChartSpec => Boolean(entry))
    }
    if (parsed && typeof parsed === "object") {
      const bundle = parsed as { charts?: unknown }
      if (Array.isArray(bundle.charts)) {
        return bundle.charts
          .map((entry) => normalizeChartSpec(entry))
          .filter((entry): entry is ChatChartSpec => Boolean(entry))
      }
    }
    const single = normalizeChartSpec(parsed)
    return single ? [single] : []
  } catch {
    return []
  }
}

export function parseChartSpec(raw: string): ChatChartSpec | null {
  const parsed = parseChartSpecs(raw)
  return parsed.length > 0 ? parsed[0] : null
}

export function ChatChartBundle({
  specs,
  className,
  onDrilldown,
}: {
  specs: ChatChartSpec[]
  className?: string
  onDrilldown?: (payload: ChartDrilldownPayload) => void
}) {
  if (specs.length === 0) return null
  if (specs.length === 1) {
    return (
      <ChatChart
        spec={specs[0]}
        className={className}
        onDrilldown={onDrilldown}
      />
    )
  }
  return (
    <div className={cn("my-2 grid gap-3", className)}>
      {specs.map((spec, index) => (
        <ChatChart
          key={`${spec.title || spec.xKey || "chart"}-${index}`}
          spec={spec}
          onDrilldown={onDrilldown}
        />
      ))}
    </div>
  )
}
