"use client"

import {
  MorphingDialog,
  MorphingDialogClose,
  MorphingDialogContainer,
  MorphingDialogContent,
  MorphingDialogDescription,
  MorphingDialogImage,
  MorphingDialogTitle,
  MorphingDialogTrigger,
} from "@/components/motion-primitives/morphing-dialog"
import { buttonVariants } from "@/components/ui/button"
import type { EvidenceCitation, UploadVisualReference } from "@/lib/evidence/types"
import { cn } from "@/lib/utils"
import { ArrowSquareOut, ImagesSquare } from "@phosphor-icons/react"
import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { LinkedVisualShader } from "./linked-visual-shader"

type CitationVisualCard = {
  key: string
  href: string
  isInternal: boolean
  visual: UploadVisualReference
  citationIndex: number
  sourceTitle: string
  sourceLabel: string
  pageLabel?: string | null
  caption?: string | null
}

function buildVisualCards(citations: EvidenceCitation[]): CitationVisualCard[] {
  const cards: CitationVisualCard[] = []
  const seen = new Set<string>()

  citations.forEach((citation) => {
    const href = citation.url || citation.previewReference?.fullUrl || citation.figureReferences?.[0]?.fullUrl || ""
    if (!href) return
    const isInternal = href.startsWith("/")
    const sourceLabel =
      citation.sourceLabel || citation.journal || citation.title || `Citation ${citation.index}`
    const sourceTitle = citation.title || sourceLabel
    const visuals = [
      ...(citation.previewReference ? [citation.previewReference] : []),
      ...(citation.figureReferences || []),
    ].filter((visual) => visual?.signedUrl)

    visuals.forEach((visual, visualIndex) => {
      const dedupeKey = visual.assetId || visual.filePath || `${citation.index}:${visual.label}:${visualIndex}`
      if (seen.has(dedupeKey)) return
      seen.add(dedupeKey)
      cards.push({
        key: dedupeKey,
        href,
        isInternal,
        visual,
        citationIndex: citation.index,
        sourceTitle,
        sourceLabel,
        pageLabel: citation.pageLabel,
        caption: visual.caption || citation.snippet || null,
      })
    })
  })

  return cards.slice(0, 4)
}

function SourceLink({
  href,
  isInternal,
  className,
  children,
}: {
  href: string
  isInternal: boolean
  className?: string
  children: ReactNode
}) {
  if (isInternal) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  )
}

function paletteForCard(card: CitationVisualCard, featured: boolean): [string, string, string] {
  const palettes: Array<[string, string, string]> = [
    ["#67e8f9", "#818cf8", "#f472b6"],
    ["#38bdf8", "#a78bfa", "#fb7185"],
    ["#22d3ee", "#c084fc", "#f59e0b"],
    ["#7dd3fc", "#34d399", "#a78bfa"],
  ]
  const baseIndex = (card.citationIndex + (featured ? 1 : 0)) % palettes.length
  return palettes[baseIndex]
}

function VisualTile({
  card,
  featured = false,
}: {
  card: CitationVisualCard
  featured?: boolean
}) {
  const shaderPalette = paletteForCard(card, featured)

  return (
    <MorphingDialog
      transition={{
        type: "spring",
        stiffness: 280,
        damping: 24,
        mass: 0.45,
      }}
    >
      <MorphingDialogTrigger className="w-full text-left">
        <div
          className={cn(
            "group/figure overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm",
            featured ? "h-full" : ""
          )}
        >
          <div className={cn("relative overflow-hidden bg-muted", featured ? "aspect-[16/10]" : "aspect-[4/3]")}>
            <LinkedVisualShader
              colors={shaderPalette}
              intensity={featured ? 0.92 : 0.72}
              speed={featured ? 1 : 0.82}
              className="z-10 opacity-80 mix-blend-screen"
            />
            <Image
              src={card.visual.signedUrl || ""}
              alt={card.visual.label || card.sourceTitle}
              fill
              unoptimized
              className="object-cover transition-transform duration-300 group-hover/figure:scale-[1.02]"
            />
            <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.06),rgba(15,23,42,0.28))]" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-3 py-3 text-white">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-white/85">
                <span>[{card.citationIndex}]</span>
                <span>{card.visual.label || "Figure"}</span>
              </div>
              <MorphingDialogTitle className="mt-1 line-clamp-2 text-sm font-semibold leading-tight">
                {card.sourceTitle}
              </MorphingDialogTitle>
              <p className="mt-1 line-clamp-2 text-xs text-white/85">
                {card.caption || card.sourceLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground/90">{card.sourceLabel}</p>
              {card.pageLabel ? (
                <p className="truncate text-[11px] text-muted-foreground">{card.pageLabel}</p>
              ) : null}
            </div>
            <span className="text-[11px] font-medium text-primary">Expand</span>
          </div>
        </div>
      </MorphingDialogTrigger>

      <MorphingDialogContainer>
        <MorphingDialogContent className="relative w-[min(92vw,960px)] overflow-hidden rounded-3xl border border-white/10 bg-background shadow-2xl">
          <div className="grid min-h-[min(78vh,720px)] grid-cols-1 md:grid-cols-[minmax(0,1.35fr)_360px]">
            <div className="relative flex items-center justify-center overflow-hidden bg-black/95 p-4 md:p-6">
              <LinkedVisualShader
                colors={shaderPalette}
                intensity={1.05}
                speed={1.15}
                className="opacity-95 mix-blend-screen"
              />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_28%,rgba(3,7,18,0.44)_82%),linear-gradient(135deg,rgba(15,23,42,0.28),rgba(2,6,23,0.72))]" />
              <MorphingDialogImage
                src={card.visual.signedUrl || ""}
                alt={card.visual.label || card.sourceTitle}
                className="relative z-10 max-h-[72vh] max-w-full rounded-2xl object-contain shadow-[0_30px_80px_rgba(15,23,42,0.42)]"
              />
            </div>
            <div className="flex flex-col gap-4 border-t border-border/70 p-5 md:border-t-0 md:border-l">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Evidence Figure
                </p>
                <MorphingDialogTitle className="mt-2 text-lg font-semibold leading-tight">
                  {card.sourceTitle}
                </MorphingDialogTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  {card.sourceLabel}
                  {card.pageLabel ? ` • ${card.pageLabel}` : ""}
                </p>
              </div>

              <MorphingDialogDescription
                disableLayoutAnimation
                className="space-y-3 text-sm leading-6 text-foreground/90"
                variants={{
                  initial: { opacity: 0, y: 8 },
                  animate: { opacity: 1, y: 0 },
                  exit: { opacity: 0, y: -4 },
                }}
              >
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Figure label
                  </p>
                  <p className="mt-1 text-sm font-medium">{card.visual.label || "Figure"}</p>
                </div>
                {card.caption ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Caption
                    </p>
                    <p className="mt-1 text-sm leading-6">{card.caption}</p>
                  </div>
                ) : null}
                <SourceLink
                  href={card.href}
                  isInternal={card.isInternal}
                  className={cn(
                    buttonVariants({ variant: "secondary" }),
                    "h-9 rounded-full px-4"
                  )}
                >
                  <>
                    Open source
                    <ArrowSquareOut className="size-4" />
                  </>
                </SourceLink>
              </MorphingDialogDescription>
            </div>
          </div>
        </MorphingDialogContent>
        <MorphingDialogClose className="text-white" />
      </MorphingDialogContainer>
    </MorphingDialog>
  )
}

export function CitationVisualGallery({
  citations,
  className,
}: {
  citations: EvidenceCitation[]
  className?: string
}) {
  const cards = buildVisualCards(citations)
  if (cards.length === 0) return null

  const [featured, ...secondary] = cards

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <ImagesSquare className="size-4" />
        <span>Evidence Visuals</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
        <VisualTile card={featured} featured />
        {secondary.length > 0 ? (
          <div className={cn("grid gap-3", secondary.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-1")}>
            {secondary.map((card) => (
              <VisualTile key={card.key} card={card} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
