"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CLINICIAN_MODE_PLACEHOLDERS,
  CLINICIAN_MODE_DESCRIPTIONS,
  CLINICIAN_MODE_LABELS,
  type ClinicianWorkflowMode,
} from "@/lib/clinician-mode"
import { cn } from "@/lib/utils"
import {
  Info,
  MagnifyingGlass,
  Plus,
  ShieldCheck,
} from "@phosphor-icons/react"

type ClinicianWorkflowPanelProps = {
  mode: ClinicianWorkflowMode
  onSubmitPrompt: (prompt: string) => void
  isSubmitting?: boolean
}

type MedicationSearchResponse = {
  suggestions: string[]
  sources: string[]
}

export function ClinicianWorkflowPanel({
  mode,
  onSubmitPrompt,
  isSubmitting = false,
}: ClinicianWorkflowPanelProps) {
  const [openSearchQuery, setOpenSearchQuery] = useState("")
  const [openSearchSetting, setOpenSearchSetting] = useState("outpatient")
  const [openSearchGoal, setOpenSearchGoal] = useState("differential")
  const [clinicalTopic, setClinicalTopic] = useState("")
  const [clinicalSetting, setClinicalSetting] = useState("inpatient")
  const [icd10Code, setIcd10Code] = useState("")
  const [medReviewCase, setMedReviewCase] = useState("")
  const [medReviewGoal, setMedReviewGoal] = useState("optimization")
  const [drugContext, setDrugContext] = useState("")
  const [stewardshipCase, setStewardshipCase] = useState("")
  const [stewardshipFocus, setStewardshipFocus] = useState("empiric")

  const [drugInput, setDrugInput] = useState("")
  const [selectedDrugs, setSelectedDrugs] = useState<string[]>([])
  const [medicationSuggestions, setMedicationSuggestions] = useState<string[]>([])
  const [medicationSources, setMedicationSources] = useState<string[]>([])
  const [isMedicationSearchLoading, setIsMedicationSearchLoading] = useState(false)

  const baseShell =
    "min-w-0 w-full max-w-full space-y-3 rounded-2xl border border-border/50 bg-muted/25 p-3 sm:space-y-4 sm:rounded-3xl sm:p-6 max-h-[74dvh] overflow-y-auto overscroll-contain md:max-h-none md:overflow-visible"
  const panelCard = "rounded-2xl border border-border/60 bg-background/80 shadow-xs"
  const modeDescription = CLINICIAN_MODE_DESCRIPTIONS[mode]

  const submit = useCallback(
    (prompt: string) => {
      if (!prompt.trim() || isSubmitting) return
      onSubmitPrompt(prompt.trim())
    },
    [isSubmitting, onSubmitPrompt]
  )

  const addDrug = useCallback(() => {
    const next = drugInput.trim()
    if (!next) return
    if (selectedDrugs.some((drug) => drug.toLowerCase() === next.toLowerCase())) {
      setDrugInput("")
      return
    }
    setSelectedDrugs((prev) => [...prev, next])
    setDrugInput("")
  }, [drugInput, selectedDrugs])

  const addDrugFromSuggestion = useCallback(
    (name: string) => {
      const next = name.trim()
      if (!next) return
      if (selectedDrugs.some((drug) => drug.toLowerCase() === next.toLowerCase())) {
        setDrugInput("")
        setMedicationSuggestions([])
        return
      }
      setSelectedDrugs((prev) => [...prev, next])
      setDrugInput("")
      setMedicationSuggestions([])
    },
    [selectedDrugs]
  )

  const removeDrug = useCallback((drugToRemove: string) => {
    setSelectedDrugs((prev) => prev.filter((drug) => drug !== drugToRemove))
  }, [])

  useEffect(() => {
    if (mode !== "drug_interactions") return

    const query = drugInput.trim()
    if (query.length < 2) {
      setMedicationSuggestions([])
      setMedicationSources([])
      setIsMedicationSearchLoading(false)
      return
    }

    const controller = new AbortController()
    setIsMedicationSearchLoading(true)

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/medications/search?q=${encodeURIComponent(query)}&limit=25`,
          {
            method: "GET",
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          setMedicationSuggestions([])
          setMedicationSources([])
          return
        }

        const data = (await response.json()) as MedicationSearchResponse
        const suggestions = (data.suggestions || []).filter(
          (name) =>
            !selectedDrugs.some(
              (drug) => drug.toLowerCase() === name.toLowerCase()
            )
        )
        setMedicationSuggestions(suggestions)
        setMedicationSources(data.sources || [])
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setMedicationSuggestions([])
          setMedicationSources([])
        }
      } finally {
        setIsMedicationSearchLoading(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [drugInput, mode, selectedDrugs])

  const workflowHeader = (
    <div className={cn(panelCard, "overflow-hidden")}>
      <div className="bg-gradient-to-br from-background to-muted/40 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                {CLINICIAN_MODE_LABELS[mode]}
              </Badge>
              {modeDescription.benchmarkBacked ? (
                <Badge className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="mr-1.5 size-3.5" />
                  Benchmark-backed
                </Badge>
              ) : null}
            </div>
            <div>
              <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {modeDescription.tagline}
              </h3>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:line-clamp-none sm:text-sm">
                {modeDescription.trustClaim}
              </p>
            </div>
          </div>
          <div className="hidden max-w-full flex-wrap gap-2 sm:flex">
            {modeDescription.keyOutputs.slice(0, 2).map((item) => (
              <Badge key={item} variant="secondary" className="rounded-full text-[11px]">
                {item}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  if (mode === "open_search") {
    return (
      <section className={baseShell}>
        {workflowHeader}
        <div className={cn(panelCard, "space-y-4 p-4")}>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Clinical question</Label>
              <div className="rounded-2xl border border-border/60 bg-background px-3 py-2">
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <MagnifyingGlass className="size-3.5" />
                  Open search
                </div>
                <Textarea
                  value={openSearchQuery}
                  onChange={(e) => setOpenSearchQuery(e.target.value)}
                  placeholder={CLINICIAN_MODE_PLACEHOLDERS.open_search}
                  className="min-h-28 resize-y border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Care setting</Label>
                <Select value={openSearchSetting} onValueChange={setOpenSearchSetting}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outpatient">Outpatient</SelectItem>
                    <SelectItem value="urgent-care">Urgent care</SelectItem>
                    <SelectItem value="inpatient">Inpatient</SelectItem>
                    <SelectItem value="icu">ICU</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Primary goal</Label>
                <Select value={openSearchGoal} onValueChange={setOpenSearchGoal}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="differential">Differential</SelectItem>
                    <SelectItem value="next-steps">Next steps</SelectItem>
                    <SelectItem value="guideline">Guideline pull</SelectItem>
                    <SelectItem value="medication">Medication decision</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Optimized for concise evidence synthesis with immediate clinical next steps.
            </p>
            <Button
              type="button"
              size="sm"
              disabled={isSubmitting || !openSearchQuery.trim()}
              onClick={() =>
                submit(
                  `Open Search (${openSearchSetting}, ${openSearchGoal}): ${openSearchQuery.trim()}\n\nReturn a focused, evidence-aware clinical response with key risks, next steps, and any critical missing data.`
                )
              }
              className="rounded-full"
            >
              Search
            </Button>
          </div>
        </div>
      </section>
    )
  }

  if (mode === "clinical_summary") {
    return (
      <section className={baseShell}>
        {workflowHeader}
        <div className={cn(panelCard, "space-y-4 p-4")}>
          <div className="grid gap-3 md:grid-cols-[1.6fr,0.8fr]">
            <div className="space-y-2">
              <Label>Patient context or note excerpt</Label>
              <Textarea
                value={clinicalTopic}
                onChange={(e) => setClinicalTopic(e.target.value)}
                placeholder="Paste the note, handoff, or problem-oriented summary you want distilled."
                className="min-h-28 resize-y"
              />
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Target setting</Label>
                <Select value={clinicalSetting} onValueChange={setClinicalSetting}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inpatient">Inpatient progress note</SelectItem>
                    <SelectItem value="handoff">Handoff / sign-out</SelectItem>
                    <SelectItem value="ed">ED summary</SelectItem>
                    <SelectItem value="clinic">Clinic follow-up</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                Output includes a one-liner, active problems, plan, and watch items.
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Button
              type="button"
              className="rounded-full"
              disabled={isSubmitting || !clinicalTopic.trim()}
              onClick={() =>
                submit(
                  `Clinical Summary request (${clinicalSetting}):\n${clinicalTopic.trim()}\n\nReturn a concise one-liner, active problems, key data trends, immediate plan, and escalation/watch items.`
                )
              }
            >
              Generate summary
            </Button>
          </div>
        </div>
      </section>
    )
  }

  if (mode === "drug_interactions") {
    return (
      <section className={baseShell}>
        {workflowHeader}

        <div className={panelCard}>
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <MagnifyingGlass className="size-4 text-muted-foreground" />
            <Input
              value={drugInput}
              onChange={(e) => setDrugInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  if (medicationSuggestions.length > 0) {
                    addDrugFromSuggestion(medicationSuggestions[0])
                    return
                  }
                  addDrug()
                }
              }}
              placeholder="Add a drug you want to compare (ex: Tylenol)"
              className="border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={addDrug}
              disabled={isSubmitting || !drugInput.trim()}
              aria-label="Add drug"
            >
              <Plus className="size-4" />
            </Button>
          </div>

          <div className="space-y-4 p-4 pb-20 md:pb-4">
            <div className="space-y-2">
              <Label>Patient factors</Label>
              <Textarea
                value={drugContext}
                onChange={(e) => setDrugContext(e.target.value)}
                placeholder="Optional: age, renal function, liver disease, QT risk, bleeding risk, pregnancy status, allergies..."
                className="min-h-20 resize-y"
              />
            </div>
            <div>
              <p className="font-medium">Getting Started</p>
              <p className="text-sm text-muted-foreground">
                Search for and select at least two drugs to analyze interactions.
              </p>
            </div>

            {drugInput.trim().length >= 2 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {isMedicationSearchLoading
                    ? "Searching medication databases..."
                    : medicationSuggestions.length > 0
                      ? `Medication suggestions${
                          medicationSources.length > 0
                            ? ` (${medicationSources.join(", ")})`
                            : ""
                        }`
                      : "No suggestions found. Press + to add your typed medication manually."}
                </p>
                {!isMedicationSearchLoading && medicationSuggestions.length > 0 && (
                  <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                    {medicationSuggestions.map((name) => (
                      <Button
                        key={name}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addDrugFromSuggestion(name)}
                        className="h-7 rounded-full px-3 text-xs"
                      >
                        {name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex min-h-8 flex-wrap gap-2">
              {selectedDrugs.map((drug) => (
                <Badge
                  key={drug}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => removeDrug(drug)}
                  title="Click to remove"
                >
                  {drug}
                </Badge>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {selectedDrugs.length} drug{selectedDrugs.length === 1 ? "" : "s"} selected.
              </p>
              <Button
                type="button"
                disabled={isSubmitting || selectedDrugs.length < 2}
                onClick={() =>
                  submit(
                    `Drug interaction analysis for: ${selectedDrugs.join(", ")}.\n\nPatient factors: ${drugContext.trim() || "Not provided"}.\n\nPlease identify interaction severity, mechanism, monitoring, renal/hepatic considerations, and safer alternatives if needed.`
                  )
                }
              >
                Analyze
              </Button>
            </div>

          </div>
        </div>
      </section>
    )
  }

  if (mode === "stewardship") {
    return (
      <section className={baseShell}>
        {workflowHeader}
        <div className={cn(panelCard, "space-y-4 p-4")}>
          <div className="grid gap-3 md:grid-cols-[1.7fr,0.8fr]">
            <div className="space-y-2">
              <Label>Case details</Label>
              <Textarea
                value={stewardshipCase}
                onChange={(e) => setStewardshipCase(e.target.value)}
                placeholder="Paste the suspected syndrome, severity, cultures, allergies, renal function, prior antibiotics, and microbiology context."
                className="min-h-28 resize-y"
              />
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Primary focus</Label>
                <Select value={stewardshipFocus} onValueChange={setStewardshipFocus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empiric">Empiric therapy</SelectItem>
                    <SelectItem value="de-escalation">De-escalation</SelectItem>
                    <SelectItem value="duration">Duration</SelectItem>
                    <SelectItem value="culture-follow-up">Culture follow-up</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                Fleming will frame syndrome, initial coverage, de-escalation triggers, duration, and missing stewardship data.
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Button
              type="button"
              className="rounded-full"
              disabled={isSubmitting || !stewardshipCase.trim()}
              onClick={() =>
                submit(
                  `Stewardship review (${stewardshipFocus}):\n${stewardshipCase.trim()}\n\nBuild an antimicrobial plan that covers syndrome framing, empiric/targeted options, de-escalation triggers, duration guidance, and cultures or data that still need follow-up.`
                )
              }
            >
              Build stewardship plan
            </Button>
          </div>
        </div>
      </section>
    )
  }

  if (mode === "icd10_codes") {
    return (
      <section className={baseShell}>
        {workflowHeader}
        <div className={cn(panelCard, "space-y-4 p-4")}>
          <div className="flex items-center gap-3">
            <Input
              value={icd10Code}
              onChange={(e) => setIcd10Code(e.target.value)}
              placeholder="Example: E83.110 or paste the assessment you need coded"
              className="rounded-2xl"
            />
            <Button
              type="button"
              className="rounded-full"
              disabled={isSubmitting || !icd10Code.trim()}
              onClick={() =>
                submit(
                  `ICD10 assistance for code or assessment: ${icd10Code.trim()}.\n\nProvide plain-language definition, likely coding candidates, required specificity, and coding caveats.`
                )
              }
            >
              Analyze
            </Button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={baseShell}>
      {workflowHeader}
      <div className={cn(panelCard, "space-y-4 p-4")}>
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            Patient Case
            <Info className="size-3.5 text-muted-foreground" />
          </Label>
          <Textarea
            value={medReviewCase}
            onChange={(e) => setMedReviewCase(e.target.value)}
            placeholder="Type or paste the medication list, comorbidities, renal/hepatic function, falls/bleeding risk, and goals of care."
            className="min-h-24 resize-y"
          />
        </div>
        <div className="space-y-2">
          <Label>Primary review goal</Label>
          <Select value={medReviewGoal} onValueChange={setMedReviewGoal}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="optimization">Optimization</SelectItem>
              <SelectItem value="deprescribing">Deprescribing</SelectItem>
              <SelectItem value="safety">Safety review</SelectItem>
              <SelectItem value="follow-up">Follow-up plan</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={isSubmitting || !medReviewCase.trim()}
          onClick={() =>
            submit(
              `Medication review request (${medReviewGoal}):\n${medReviewCase.trim()}\n\nPlease evaluate interaction risks, contraindications, highest-risk medications, optimization or deprescribing opportunities, and follow-up monitoring.`
            )
          }
        >
          Submit
        </Button>
      </div>
    </section>
  )
}
