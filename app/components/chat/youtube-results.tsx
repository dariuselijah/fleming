"use client"

import { cn } from "@/lib/utils"
import Image from "next/image"

export type YouTubeResultItem = {
  videoId: string
  url: string
  title: string
  description: string
  channelTitle: string
  publishedAt: string | null
  thumbnailUrl: string | null
  duration?: string
  viewCount?: number
  trustedScore?: number
}

type YouTubeResultsProps = {
  results: YouTubeResultItem[]
  className?: string
}

function formatDuration(duration?: string): string | null {
  if (!duration) return null
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return null
  const hours = Number(match[1] || 0)
  const minutes = Number(match[2] || 0)
  const seconds = Number(match[3] || 0)

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function formatViewCount(viewCount?: number): string | null {
  if (!viewCount || !Number.isFinite(viewCount)) return null
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(viewCount)
}

function formatPublishedAt(publishedAt: string | null): string | null {
  if (!publishedAt) return null
  const date = new Date(publishedAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" })
}

export function YouTubeResults({ results, className }: YouTubeResultsProps) {
  if (!results?.length) return null
  const uniqueResults = Array.from(
    new Map(
      results.map((video) => {
        const stableKey = `${video.videoId}|${video.url}`
        return [stableKey, video]
      })
    ).values()
  ).slice(0, 9)

  return (
    <div className={cn("my-2 space-y-2", className)}>
      {uniqueResults.map((video, index) => {
        const durationLabel = formatDuration(video.duration)
        const viewsLabel = formatViewCount(video.viewCount)
        const publishedLabel = formatPublishedAt(video.publishedAt)
        return (
          <div
            key={`${video.videoId}|${video.url}|${index}`}
            className="group flex items-start gap-2.5 rounded-md px-1 py-1"
          >
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-muted relative mt-0.5 h-14 w-24 shrink-0 overflow-hidden rounded-md border"
            >
              {video.thumbnailUrl ? (
                <Image
                  src={video.thumbnailUrl}
                  alt={video.title}
                  fill
                  sizes="96px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="text-muted-foreground flex h-full items-center justify-center text-[10px]">
                  No preview
                </div>
              )}
              {durationLabel && (
                <span className="bg-background/90 text-foreground absolute right-1 bottom-1 rounded px-1 text-[9px] font-medium">
                  {durationLabel}
                </span>
              )}
            </a>
            <div className="min-w-0 flex-1 pt-0.5">
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="line-clamp-2 text-sm font-medium hover:underline"
              >
                {video.title}
              </a>
              <div className="text-muted-foreground mt-0.5 line-clamp-1 text-[11px]">
                {video.channelTitle}
              </div>
              <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 text-[11px]">
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="line-clamp-1 hover:underline"
                >
                  youtube.com
                </a>
                {viewsLabel ? <span>{viewsLabel} views</span> : null}
                {publishedLabel ? <span>{publishedLabel}</span> : null}
              </div>
              {video.description ? (
                <div className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                  {video.description}
                </div>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
