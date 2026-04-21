"use client"

import { useMemo } from "react"

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  fillOpacity?: number
}

export function RevenueSparkline({
  data,
  width = 200,
  height = 48,
  color = "currentColor",
  fillOpacity = 0.1,
}: SparklineProps) {
  const path = useMemo(() => {
    if (data.length < 2) return ""
    const max = Math.max(...data, 1)
    const step = width / (data.length - 1)
    const points = data.map((v, i) => ({
      x: i * step,
      y: height - (v / max) * (height * 0.85),
    }))
    const line = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ")
    const fill = `${line} L${width},${height} L0,${height} Z`
    return { line, fill }
  }, [data, width, height])

  if (!path) return null

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <path d={path.fill} fill={color} fillOpacity={fillOpacity} />
      <path d={path.line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
