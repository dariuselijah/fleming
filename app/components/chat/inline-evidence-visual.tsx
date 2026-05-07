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
import { ArrowSquareOut, ImageSquare } from "@phosphor-icons/react"
import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { LinkedVisualShader } from "./linked-visual-shader"

function getPrimaryVisual(citation: EvidenceCitation): UploadVisualReference | null {
  const references = [
    ...(citation.previewReference ? [citation.previewReference] : []),
    ...(citation.figureReferences || []),
  ]
  return references.find((reference) => Boolean(reference?.signedUrl)) || null
}

function paletteForCitation(citation: EvidenceCitation): [string, string, string] {
  const palettes: Array<[string, string, string]> = [
    ["#67e8f9", "#818cf8", "#f472b6"],
    ["#38bdf8", "#a78bfa", "#fb7185"],
    ["#22d3ee", "#c084fc", "#f59e0b"],
    ["#7dd3fc", "#34d399", "#a78bfa"],
  ]
  return palettes[citation.index % palettes.length]
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

export function InlineEvidenceVisual({
  citation,
  className,
}: {
  citation: EvidenceCitation
  className?: string
}) {
  const visual = getPrimaryVisual(citation)
  if (!visual?.signedUrl) return null

  const href = citation.url || visual.fullUrl || visual.signedUrl || ""
  const isInternal = href.startsWith("/")
  const sourceLabel =
    citation.sourceLabel || citation.journal || citation.title || `Citation ${citation.index}`
  const sourceTitle = citation.title || sourceLabel
  const caption = visual.caption || citation.snippet || null
  const shaderPalette = paletteForCitation(citation)

  return (
    <figure
      className={cn(
        "not-prose my-5 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm",
        className
      )}
    >
      <MorphingDialog
        transition={{
          type: "spring",
          stiffness: 280,
          damping: 24,
          mass: 0.45,
        }}
      >
        <MorphingDialogTrigger className="block w-full text-left">
          <div className="relative overflow-hidden bg-muted">
            <div className="relative aspect-[16/9]">
              <LinkedVisualShader
                colors={shaderPalette}
                intensity={0.88}
                speed={0.92}
                className="z-10 opacity-75 mix-blend-screen"
              />
              <Image
                src={visual.signedUrl}
                alt={visual.label || sourceTitle}
                fill
                unoptimized
                className="object-cover transition-transform duration-300 hover:scale-[1.01]"
              />
              <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.04),rgba(15,23,42,0.36))]" />
              <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 py-3 text-white">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-white/80">
                  <ImageSquare className="size-3.5" />
                  <span>Inline Evidence Visual</span>
                  <span>[{citation.index}]</span>
                  <span>{visual.label || "Figure"}</span>
                </div>
                <MorphingDialogTitle className="mt-1 line-clamp-2 text-sm font-semibold leading-tight">
                  {sourceTitle}
                </MorphingDialogTitle>
              </div>
            </div>
          </div>
        </MorphingDialogTrigger>

        <figcaption className="space-y-3 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {sourceLabel}
              </p>
              {caption ? (
                <p className="mt-1 line-clamp-3 text-sm leading-6 text-foreground/90">{caption}</p>
              ) : null}
            </div>
            <span className="shrink-0 text-[11px] font-medium text-primary">Expand</span>
          </div>

          {href ? (
            <SourceLink
              href={href}
              isInternal={isInternal}
              className={cn(buttonVariants({ variant: "secondary" }), "h-8 rounded-full px-3 text-xs")}
            >
              <>
                Open source
                <ArrowSquareOut className="size-3.5" />
              </>
            </SourceLink>
          ) : null}
        </figcaption>

        <MorphingDialogContainer>
          <MorphingDialogContent className="relative w-[min(92vw,960px)] overflow-hidden rounded-3xl border border-white/10 bg-background shadow-2xl">
            <div className="grid min-h-[min(78vh,720px)] grid-cols-1 md:grid-cols-[minmax(0,1.35fr)_360px]">
              <div className="relative flex items-center justify-center overflow-hidden bg-black/95 p-4 md:p-6">
                <LinkedVisualShader
                  colors={shaderPalette}
                  intensity={1.05}
                  speed={1.12}
                  className="opacity-95 mix-blend-screen"
                />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_28%,rgba(3,7,18,0.44)_82%),linear-gradient(135deg,rgba(15,23,42,0.28),rgba(2,6,23,0.72))]" />
                <MorphingDialogImage
                  src={visual.signedUrl}
                  alt={visual.label || sourceTitle}
                  className="relative z-10 max-h-[72vh] max-w-full rounded-2xl object-contain shadow-[0_30px_80px_rgba(15,23,42,0.42)]"
                />
              </div>
              <div className="flex flex-col gap-4 border-t border-border/70 p-5 md:border-t-0 md:border-l">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Evidence Figure
                  </p>
                  <MorphingDialogTitle className="mt-2 text-lg font-semibold leading-tight">
                    {sourceTitle}
                  </MorphingDialogTitle>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {sourceLabel}
                    {citation.pageLabel ? ` • ${citation.pageLabel}` : ""}
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
                    <p className="mt-1 text-sm font-medium">{visual.label || "Figure"}</p>
                  </div>
                  {caption ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Caption
                      </p>
                      <p className="mt-1 text-sm leading-6">{caption}</p>
                    </div>
                  ) : null}
                  {href ? (
                    <SourceLink
                      href={href}
                      isInternal={isInternal}
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
                  ) : null}
                </MorphingDialogDescription>
              </div>
            </div>
          </MorphingDialogContent>
          <MorphingDialogClose className="text-white" />
        </MorphingDialogContainer>
      </MorphingDialog>
    </figure>
  )
}
