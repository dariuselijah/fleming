"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  ArrowUpRight,
  CaretDown,
  Files,
  Heartbeat,
  Pulse,
  Shuffle,
  WarningCircle,
} from "@phosphor-icons/react"
import Link from "next/link"
import { type ComponentType, useEffect, useState } from "react"

type HealthJourney = {
  title: string
  icon: ComponentType<{ className?: string }>
}

type ExploreTopic = {
  title: string
  prompt: string
  examples: string[]
}

type HealthRole = "general" | "doctor" | "medical_student"

const GENERAL_HEALTH_JOURNEYS: HealthJourney[] = [
  {
    title: "Suggest simple changes I can make this week to improve my sleep and energy.",
    icon: Pulse,
  },
  {
    title: "Recommend small nutrition tweaks I can make to better support my heart health.",
    icon: Heartbeat,
  },
  {
    title:
      "Generate a personalized report on my long-term health risks using my labs, vitals, and family history.",
    icon: Files,
  },
  {
    title: "Help me decide whether a symptom is urgent enough to contact my doctor.",
    icon: WarningCircle,
  },
]

const GENERAL_EXPLORE_TOPICS: ExploreTopic[] = [
  {
    title: "Fitness and Exercise",
    prompt:
      "Build a practical fitness plan for this week based on my current goals, recovery, and schedule.",
    examples: [
      "Build a 7-day cardio + strength split from my current activity and recovery trends.",
      "Give me two exercise options for low-energy days while still progressing this month.",
      "Create a travel-week plan with minimal equipment and a clear daily checklist.",
    ],
  },
  {
    title: "Understand your results",
    prompt:
      "Help me understand my recent biomarker and vitals results, what is in range, and what to watch next.",
    examples: [
      "Interpret my last three lab panels and highlight what changed the most and why it matters.",
      "Explain which values are borderline and what repeat testing window I should consider.",
      "Turn these results into a simple watchlist for the next 8 weeks.",
    ],
  },
  {
    title: "Improve sleep and energy",
    prompt:
      "Give me a sleep and energy optimization plan with simple habits I can start this week.",
    examples: [
      "Design a 5-day reset for sleep consistency using my current bedtime and wake trend.",
      "Identify likely causes of my afternoon energy crash and suggest one-week experiments.",
      "Create a pre-sleep routine with measurable targets and fallback options.",
    ],
  },
  {
    title: "Prepare for a visit",
    prompt:
      "Help me prepare for my next doctor visit with key questions and what data to bring.",
    examples: [
      "Draft my top 10 visit questions based on my symptoms and trend history.",
      "Summarize what data I should bring and how to present it in under 2 minutes.",
      "Create a concise pre-visit brief with concerns, priorities, and desired outcomes.",
    ],
  },
  {
    title: "Fuel and nutrition",
    prompt:
      "Recommend nutrition adjustments that support heart health, steady energy, and training recovery.",
    examples: [
      "Create a practical weekday meal framework for heart-friendly eating and stable energy.",
      "Suggest 3 nutrition swaps with the highest impact for my current routine.",
      "Build a pre/post-workout fueling guide based on my training times.",
    ],
  },
]

const MEDICAL_STUDENT_HEALTH_JOURNEYS: HealthJourney[] = [
  {
    title:
      "Use this clinical biomarker trend to create a concise presentation-style assessment with a chart and high-yield teaching points.",
    icon: Pulse,
  },
  {
    title:
      "Compare two plausible management pathways and visualize risk/benefit trade-offs in a chart for exam-style reasoning.",
    icon: Heartbeat,
  },
  {
    title:
      "Build a study-ready summary from this case lab and vital dataset, including a time-series chart and 5 rapid-fire viva questions.",
    icon: Files,
  },
  {
    title:
      "Challenge me with a short case simulation from this patient profile and reveal findings stepwise with chart-backed interpretation.",
    icon: WarningCircle,
  },
]

const MEDICAL_STUDENT_EXPLORE_TOPICS: ExploreTopic[] = [
  {
    title: "Chart-first interpretation",
    prompt:
      "Interpret these health trends like an OSCE station, and include a clean chart with key turning points.",
    examples: [
      "Interpret this HbA1c + fasting glucose trend as an OSCE stem and identify key inflection points.",
      "Read this BP trajectory and produce a chart-first clinical summary with likely contributors.",
      "Use this CRP/WBC time series to narrate probable disease progression in exam style.",
      "Translate this mixed vitals panel into a concise chart-led assessment and viva defense.",
    ],
  },
  {
    title: "Differential builder",
    prompt:
      "Generate a differential diagnosis ladder from these vitals/labs and display supporting clues in a charted comparison.",
    examples: [
      "Build a ranked differential for dyspnea + edema using these labs and explain each discriminator.",
      "Generate a differential ladder for chest pain using timeline clues and charted probability shifts.",
      "Create a side-by-side differential matrix for microcytic anemia etiologies from this panel.",
      "Prioritize causes of acute confusion using vitals/labs and show which findings move each diagnosis up or down.",
    ],
  },
  {
    title: "Management pathways",
    prompt:
      "Show first-line vs second-line management paths and visualize expected marker trajectories in chart form.",
    examples: [
      "Map first-line vs escalation pathways for newly diagnosed HF with expected trend markers by week.",
      "Compare outpatient vs inpatient management branches for suspected DKA with triggers.",
      "Design a treatment pathway for hypertension with contraindication checkpoints and follow-up logic.",
      "Build a pathway for AKI workup and initial management with branch conditions and stopping rules.",
    ],
  },
  {
    title: "Exam drill mode",
    prompt:
      "Create 5 exam-style questions from this profile and use one chart to explain the highest-yield answer.",
    examples: [
      "Create a rapid-fire viva set from this case and include one killer discriminator question.",
      "Generate SBAs from this profile and explain why each distractor is wrong.",
      "Run a timed oral drill: ask one question at a time and score my clinical reasoning.",
      "Build an exam station from this data with examiner prompts and model answers.",
    ],
  },
  {
    title: "Evidence synthesis",
    prompt:
      "Summarize the evidence behind this trend and include a chart that maps baseline, target, and response checkpoints.",
    examples: [
      "Synthesize guideline + trial evidence for this management choice and rate confidence by source.",
      "Summarize RCT vs real-world evidence for this marker trend and identify uncertainty gaps.",
      "Build an evidence table for competing therapies with effect size, NNT, and key caveats.",
      "Create an exam-ready evidence brief with citations and a baseline-to-target response map.",
    ],
  },
]

const CLINICIAN_HEALTH_JOURNEYS: HealthJourney[] = [
  {
    title:
      "Create a concise clinical plan from this patient dataset, with charted trend deltas and immediate next-step recommendations.",
    icon: Pulse,
  },
  {
    title:
      "Risk-stratify this patient profile and visualize trajectory versus target ranges in a clinician-ready chart.",
    icon: Heartbeat,
  },
  {
    title:
      "Draft a patient-friendly follow-up explanation based on current biomarkers, including one chart for shared decision-making.",
    icon: Files,
  },
  {
    title:
      "Flag urgent vs routine concerns from this profile and generate a prioritized action checklist for the next visit.",
    icon: WarningCircle,
  },
]

const CLINICIAN_EXPLORE_TOPICS: ExploreTopic[] = [
  {
    title: "Risk stratification",
    prompt:
      "Risk-stratify this profile and display the strongest drivers in a compact chart.",
    examples: [
      "Risk-tier this profile and identify top modifiable drivers for the next visit.",
      "Build a near-term risk brief with rationale and monitoring thresholds.",
      "Create a concise high-risk watchlist with trigger points for intervention.",
    ],
  },
  {
    title: "Trajectory review",
    prompt:
      "Summarize trend trajectory against guideline thresholds and include a chart to support follow-up decisions.",
    examples: [
      "Review 12-week trajectory vs guideline targets and propose interval follow-up timing.",
      "Highlight drift from target range and likely contributors from meds/adherence/lifestyle.",
      "Generate a trajectory summary for team handoff with decision-ready chart context.",
    ],
  },
  {
    title: "Visit prep",
    prompt:
      "Prepare a high-yield pre-visit summary with red flags, monitorables, and one visual trend chart.",
    examples: [
      "Draft a one-minute pre-visit brief with red flags and likely agenda priorities.",
      "Create a monitorables checklist for the next encounter with expected trend windows.",
      "Prepare a shared decision-making snapshot with patient-facing chart annotations.",
    ],
  },
  {
    title: "Treatment impact",
    prompt:
      "Estimate likely treatment impact and chart expected biomarker movement across the next 12 weeks.",
    examples: [
      "Estimate expected response range for therapy A vs B with confidence bounds.",
      "Project marker movement over 12 weeks and identify early non-response triggers.",
      "Build a treatment impact comparison with practical follow-up checkpoints.",
    ],
  },
  {
    title: "Patient communication",
    prompt:
      "Translate this profile into patient-facing language and include a simple chart to explain progress and next goals.",
    examples: [
      "Create a plain-language explanation of this trend and what the patient should do next.",
      "Draft a motivational follow-up message grounded in current progress and barriers.",
      "Produce a chart-backed patient summary for portal messaging with clear next steps.",
    ],
  },
]

function shuffleJourneys(items: HealthJourney[]): HealthJourney[] {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

type HealthHomeSectionProps = {
  onJourneyPrompt: (prompt: string) => void
  userRole?: HealthRole
  showHeader?: boolean
  showWorkspaceLink?: boolean
  helperText?: string | null
  className?: string
}

export function HealthHomeSection({
  onJourneyPrompt,
  userRole = "general",
  showHeader = true,
  showWorkspaceLink = true,
  helperText = "Use the main chat input below to ask anything about your health.",
  className,
}: HealthHomeSectionProps) {
  const roleConfig =
    userRole === "medical_student"
      ? {
          headerTitle: "Explore clinical learning journeys",
          headerDescription:
            "Practice clinical reasoning with chart-driven prompts, stepwise interpretation, and exam-ready framing.",
          journeysTitle: "Guided learning journeys",
          journeysSubtitle: "Clever prompts to learn with charts, cases, and explanations",
          exploreTitle: "Explore Clinical Learning Tracks",
          exploreSubtitle:
            "Use focused tracks to drill interpretation, differentials, and management logic",
          journeys: MEDICAL_STUDENT_HEALTH_JOURNEYS,
          topics: MEDICAL_STUDENT_EXPLORE_TOPICS,
        }
      : userRole === "doctor"
        ? {
            headerTitle: "Explore clinician workflows",
            headerDescription:
              "Run clinician-style analysis with trend charts, prioritization, and actionable care planning.",
            journeysTitle: "Guided clinical journeys",
            journeysSubtitle: "Fast prompts for evidence-aware, action-oriented analysis",
            exploreTitle: "Explore Clinical Tracks",
            exploreSubtitle:
              "Move from risk review to plan generation with chart-supported decisions",
            journeys: CLINICIAN_HEALTH_JOURNEYS,
            topics: CLINICIAN_EXPLORE_TOPICS,
          }
        : {
            headerTitle: "Explore your health inside chat",
            headerDescription:
              "Pick a guided journey to get focused, evidence-aware support in chat.",
            journeysTitle: "Guided health journeys",
            journeysSubtitle: "Fast prompts for personalized health actions",
            exploreTitle: "Explore Your Health",
            exploreSubtitle: "Discover topics and open focused conversations instantly",
            journeys: GENERAL_HEALTH_JOURNEYS,
            topics: GENERAL_EXPLORE_TOPICS,
          }
  const [journeys, setJourneys] = useState(roleConfig.journeys)
  const workspaceHref = "/uploads"
  const workspaceLabel = "Open uploads"

  useEffect(() => {
    setJourneys(roleConfig.journeys)
  }, [roleConfig.journeys, userRole])

  const handleShuffleJourneys = () => {
    setJourneys((current) => shuffleJourneys(current))
  }

  return (
    <div className={cn("space-y-4", className)}>
      {showHeader ? (
        <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-muted/30 to-background p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                AskFleming Health
              </p>
              <h2 className="mt-1 text-lg font-semibold">{roleConfig.headerTitle}</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {roleConfig.headerDescription}
              </p>
            </div>
            {showWorkspaceLink ? (
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link href={workspaceHref}>{workspaceLabel}</Link>
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{roleConfig.journeysTitle}</h3>
            <p className="text-muted-foreground text-sm">{roleConfig.journeysSubtitle}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={handleShuffleJourneys}
          >
            <Shuffle className="mr-1.5 size-4" />
            Shuffle
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {journeys.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={() => onJourneyPrompt(card.title)}
              className="group rounded-xl border border-border/70 bg-gradient-to-b from-background to-muted/20 p-4 text-left transition hover:border-foreground/15 hover:shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between">
                <card.icon className="size-4 text-muted-foreground" />
                <ArrowUpRight className="size-3.5 text-muted-foreground/80 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </div>
              <p className="text-sm leading-6">{card.title}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
        <div className="mb-2">
          <h3 className="font-semibold">{roleConfig.exploreTitle}</h3>
          <p className="text-muted-foreground text-sm">{roleConfig.exploreSubtitle}</p>
        </div>
        <div className="overflow-hidden rounded-xl border border-border/70">
          {roleConfig.topics.map((topic, index) => (
            <details
              key={topic.title}
              className={cn(
                "group border-b border-border/70 bg-background open:bg-muted/20",
                index === roleConfig.topics.length - 1 && "border-b-0"
              )}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <span className="font-medium">{topic.title}</span>
                <CaretDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-border/60 px-3 py-2.5">
                <p className="text-muted-foreground text-xs leading-5">{topic.prompt}</p>
                <div className="mt-2">
                  <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
                    Example prompts
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {topic.examples.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => onJourneyPrompt(example)}
                        className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] text-left leading-4 text-muted-foreground transition hover:border-foreground/20 hover:text-foreground"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 rounded-full text-xs"
                  onClick={() => onJourneyPrompt(topic.prompt)}
                >
                  Open in chat
                </Button>
              </div>
            </details>
          ))}
        </div>
        {helperText ? <p className="text-muted-foreground mt-3 text-xs">{helperText}</p> : null}
      </section>
    </div>
  )
}
