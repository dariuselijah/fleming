"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { LearningCardData } from "@/lib/medical-student-learning"
import { CaretDown, Pulse, ShieldCheck } from "@phosphor-icons/react"
import { useState } from "react"

type LearningCardProps = {
  card: LearningCardData
}

export function LearningCard({ card }: LearningCardProps) {
  const [showDetails, setShowDetails] = useState(false)

  if (card.type === "simulation") {
    return (
      <Card className="bg-muted/20 border-border/80 mb-3 gap-4 py-4">
        <CardHeader className="px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Pulse className="size-3" />
                Simulation
              </Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails((current) => !current)}
              className="text-muted-foreground h-7 px-2"
            >
              Details
              <CaretDown
                className={`size-3 transition-transform ${
                  showDetails ? "rotate-180" : ""
                }`}
              />
            </Button>
          </div>
          <CardTitle className="text-base leading-tight">{card.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 text-sm">
          <div>
            <div className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
              Case Stem
            </div>
            <p>{card.caseStem}</p>
          </div>
          <div>
            <div className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
              Vitals & Labs
            </div>
            <p>{card.vitalsLabs}</p>
          </div>
          <div>
            <div className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
              Decision Checkpoint
            </div>
            <p>{card.decisionCheckpoint}</p>
          </div>
          {showDetails && (
            <div className="border-border/70 space-y-2 border-t pt-3">
              <div>
                <div className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
                  Immediate Feedback
                </div>
                <p>{card.immediateFeedback}</p>
              </div>
              <div>
                <div className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
                  Next Branch
                </div>
                <p>{card.nextBranch}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-muted/20 border-border/80 mb-3 gap-4 py-4">
      <CardHeader className="px-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="size-3" />
            Guideline
          </Badge>
          <Badge variant="outline">{card.evidenceStrength}</Badge>
          <Badge variant="outline">{card.region}</Badge>
        </div>
        <CardTitle className="text-base leading-tight">{card.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 text-sm">
        <div>
          <div className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
            Recommendation
          </div>
          <p>{card.recommendation}</p>
        </div>
        <div>
          <div className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
            Source
          </div>
          <p>{card.source}</p>
        </div>
        <div className="border-border/70 rounded-lg border p-3">
          <div className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
            Apply To Case
          </div>
          <p>{card.applyToCase}</p>
        </div>
      </CardContent>
    </Card>
  )
}
