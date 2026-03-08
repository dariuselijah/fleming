import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getBenchmarkDashboardData } from "@/lib/benchmark-dashboard"

export const dynamic = "force-dynamic"

export default function TrustPage() {
  const dashboard = getBenchmarkDashboardData()

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-3xl border border-border/60 bg-gradient-to-br from-background to-muted/30 p-6 shadow-xs sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge className="w-fit rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                Trust and quality
              </Badge>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Fleming is built to be measurable, benchmark-backed, and reviewable.
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                We do not treat trust as a brand claim. Core clinician workflows are evaluated
                against citation coverage, guideline retrieval, emergency escalation, evidence
                relevance, and clinician-graded quality before release.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-full">
                <Link href="/">Open clinician workspace</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/admin/metrics">View admin metrics</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-border/60 bg-background p-6 shadow-xs">
            <div className="mb-4">
              <h2 className="text-xl font-semibold tracking-tight">Chat quality scorecard</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Latest release benchmark summary for clinician-facing chat workflows.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {dashboard.chat.cards.map((card) => (
                <MetricCard
                  key={card.label}
                  label={card.label}
                  actual={card.actual}
                  threshold={card.threshold}
                  status={card.status}
                />
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border/60 bg-background p-6 shadow-xs">
            <div className="mb-4">
              <h2 className="text-xl font-semibold tracking-tight">Retrieval quality scorecard</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Evidence freshness and retrieval depth are monitored separately from answer quality.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {dashboard.retrieval.cards.map((card) => (
                <MetricCard
                  key={card.label}
                  label={card.label}
                  actual={card.actual}
                  threshold={card.threshold}
                  status={card.status}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.3fr,0.9fr]">
          <div className="rounded-3xl border border-border/60 bg-background p-6 shadow-xs">
            <div className="mb-4">
              <h2 className="text-xl font-semibold tracking-tight">Workflow coverage</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Broad clinician coverage starts with high-frequency workflows that benefit from
                structured outputs and visible trust signals.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  name: "Clinical Summary",
                  detail: "One-liner, active problems, plan, and watch items.",
                },
                {
                  name: "Drug Interactions",
                  detail: "Severity ranking, mechanism, monitoring, and safer alternatives.",
                },
                {
                  name: "Stewardship",
                  detail: "Empiric options, de-escalation triggers, duration, and culture follow-up.",
                },
                {
                  name: "Med Review",
                  detail: "Highest-risk meds, duplication, deprescribing, and monitoring plan.",
                },
              ].map((workflow) => (
                <div
                  key={workflow.name}
                  className="rounded-2xl border border-border/60 bg-muted/25 p-4"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-full">
                      Benchmark-backed
                    </Badge>
                    <span className="text-sm font-semibold">{workflow.name}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{workflow.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border/60 bg-background p-6 shadow-xs">
            <div className="mb-4">
              <h2 className="text-xl font-semibold tracking-tight">Methodology</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A release should not go live on vibes alone.
              </p>
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>Evidence-backed answers are scored for citation density and relevance.</li>
              <li>Emergency scenarios must explicitly escalate when red flags are present.</li>
              <li>Guideline-sensitive questions are checked for guideline retrieval performance.</li>
              <li>Clinician workflows are reviewed with judge scores for quality and safety.</li>
              <li>Benchmark snapshots are derived from repo-tracked evaluation artifacts.</li>
            </ul>
          </div>
        </section>

        <section className="rounded-3xl border border-border/60 bg-background p-6 shadow-xs">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Tag-level benchmark view</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Quick slice of citation coverage by topic area from the current release artifact.
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full">
              Generated {new Date(dashboard.generatedAt).toLocaleString()}
            </Badge>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-3 font-medium">Tag</th>
                  <th className="pb-3 font-medium">Cases</th>
                  <th className="pb-3 font-medium">Avg citation coverage</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.chat.tagRows.slice(0, 8).map((row) => (
                  <tr key={row.tag} className="border-t border-border/60">
                    <td className="py-3 font-medium">{row.tag}</td>
                    <td className="py-3">{row.cases}</td>
                    <td className="py-3">{(row.avgCoverage * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

function MetricCard({
  label,
  actual,
  threshold,
  status,
}: {
  label: string
  actual: string
  threshold: string
  status: "pass" | "fail" | "unknown"
}) {
  const badgeClassName =
    status === "pass"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "fail"
        ? "bg-red-500/15 text-red-700 dark:text-red-300"
        : "bg-muted text-muted-foreground"

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <Badge className={`rounded-full ${badgeClassName}`}>
          {status === "pass" ? "Pass" : status === "fail" ? "Needs work" : "Unknown"}
        </Badge>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{actual}</div>
      <p className="mt-1 text-xs text-muted-foreground">Threshold {threshold}</p>
    </div>
  )
}
