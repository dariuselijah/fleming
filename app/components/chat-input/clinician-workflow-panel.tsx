"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ClinicianWorkflowMode } from "@/lib/clinician-mode"
import { cn } from "@/lib/utils"
import {
  Info,
  MagnifyingGlass,
  Plus,
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
  const [clinicalTopic, setClinicalTopic] = useState("")
  const [icd10Code, setIcd10Code] = useState("")
  const [medReviewCase, setMedReviewCase] = useState("")

  const [drugInput, setDrugInput] = useState("")
  const [selectedDrugs, setSelectedDrugs] = useState<string[]>([])
  const [medicationSuggestions, setMedicationSuggestions] = useState<string[]>([])
  const [medicationSources, setMedicationSources] = useState<string[]>([])
  const [isMedicationSearchLoading, setIsMedicationSearchLoading] = useState(false)

  const [infectionDescription, setInfectionDescription] = useState("")
  const [age, setAge] = useState("")
  const [gender, setGender] = useState("")
  const [weight, setWeight] = useState("")
  const [resistance, setResistance] = useState("")
  const [pregnancyStatus, setPregnancyStatus] = useState("")
  const [crcl, setCrcl] = useState("")
  const [allergies, setAllergies] = useState("")
  const [liverDisease, setLiverDisease] = useState("")

  const baseShell = "rounded-3xl border border-border/50 bg-muted/25 p-4 sm:p-6"
  const panelCard = "rounded-2xl border border-border/60 bg-background/80 shadow-xs"

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

  const stewardshipPrompt = useMemo(() => {
    return [
      "Stewardship analysis request:",
      `Infection description: ${infectionDescription || "Not provided"}`,
      `Age: ${age || "Not provided"}`,
      `Gender: ${gender || "Not provided"}`,
      `Weight: ${weight ? `${weight} kg` : "Not provided"}`,
      `Resistance context: ${resistance || "Not provided"}`,
      `Pregnancy status: ${pregnancyStatus || "Not provided"}`,
      `CrCl: ${crcl ? `${crcl} ml/min` : "Not provided"}`,
      `Allergies: ${allergies || "Not provided"}`,
      `Liver disease: ${liverDisease || "Not provided"}`,
      "",
      "Please provide empiric/targeted options, de-escalation strategy, and monitoring considerations.",
    ].join("\n")
  }, [
    age,
    allergies,
    crcl,
    gender,
    infectionDescription,
    liverDisease,
    pregnancyStatus,
    resistance,
    weight,
  ])

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

  if (mode === "open_search") {
    return (
      <section className={baseShell}>
        <h3 className="mb-4 text-2xl font-medium tracking-tight">Open Search</h3>
        <div className={cn(panelCard, "flex items-center gap-3 p-3")}>
          <MagnifyingGlass className="size-4 text-muted-foreground" />
          <Input
            value={openSearchQuery}
            onChange={(e) => setOpenSearchQuery(e.target.value)}
            placeholder="Search for clinical insights, topics, medications, or workflows..."
            className="border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            size="sm"
            disabled={isSubmitting || !openSearchQuery.trim()}
            onClick={() =>
              submit(
                `Open Search: ${openSearchQuery.trim()}\n\nGive me a focused, evidence-aware clinical response with key next steps.`
              )
            }
            className="rounded-full"
          >
            Search
          </Button>
        </div>
      </section>
    )
  }

  if (mode === "clinical_summary") {
    return (
      <section className={baseShell}>
        <h3 className="mb-4 text-2xl font-medium tracking-tight">
          Enter an individual clinical topic
        </h3>
        <div className={cn(panelCard, "flex items-center gap-3 p-3")}>
          <MagnifyingGlass className="size-4 text-muted-foreground" />
          <Input
            value={clinicalTopic}
            onChange={(e) => setClinicalTopic(e.target.value)}
            placeholder="Example: Diabetes or Metformin"
            className="border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            size="icon"
            className="rounded-full"
            disabled={isSubmitting || !clinicalTopic.trim()}
            onClick={() =>
              submit(
                `Clinical Summary request for topic: ${clinicalTopic.trim()}\n\nReturn a concise one-liner, active problems, key evidence, and practical plan.`
              )
            }
          >
            &gt;
          </Button>
        </div>
      </section>
    )
  }

  if (mode === "drug_interactions") {
    return (
      <section className={baseShell}>
        <h3 className="mb-4 text-2xl font-medium tracking-tight">Drug Interactions</h3>

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

          <div className="space-y-4 p-4">
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
                    `Drug interaction analysis for: ${selectedDrugs.join(", ")}.\n\nPlease identify interaction severity, mechanism, monitoring, and safer alternatives if needed.`
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
        <h3 className="mb-4 text-2xl font-medium tracking-tight">Antibiotic Stewardship</h3>

        <div className={panelCard}>
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <MagnifyingGlass className="size-4 text-muted-foreground" />
            <Input
              value={infectionDescription}
              onChange={(e) => setInfectionDescription(e.target.value)}
              placeholder="Describe the infection for analysis"
              className="border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <p className="font-medium">Patient Details</p>
              <Badge variant="outline" className="text-[10px] uppercase">
                Optional
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Age</Label>
                <Input value={age} onChange={(e) => setAge(e.target.value)} placeholder="Type age" />
              </div>
              <div className="space-y-1">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Weight (kgs)</Label>
                <Input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="kgs" />
              </div>
              <div className="space-y-1">
                <Label>Resistance</Label>
                <Input
                  value={resistance}
                  onChange={(e) => setResistance(e.target.value)}
                  placeholder="Known resistance"
                />
              </div>
              <div className="space-y-1">
                <Label>Pregnancy status</Label>
                <Select value={pregnancyStatus} onValueChange={setPregnancyStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not-pregnant">Not pregnant</SelectItem>
                    <SelectItem value="pregnant">Pregnant</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>CrCl (Ml/Min)</Label>
                <Input value={crcl} onChange={(e) => setCrcl(e.target.value)} placeholder="Ml/Min" />
              </div>
              <div className="space-y-1">
                <Label>Allergies</Label>
                <Input
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="Drug allergies"
                />
              </div>
              <div className="space-y-1">
                <Label>Liver disease</Label>
                <Select value={liverDisease} onValueChange={setLiverDisease}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="mild">Mild</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="severe">Severe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={isSubmitting || !infectionDescription.trim()}
              onClick={() => submit(stewardshipPrompt)}
            >
              Analyze
            </Button>
          </div>
        </div>
      </section>
    )
  }

  if (mode === "icd10_codes") {
    return (
      <section className={baseShell}>
        <h3 className="mb-4 text-2xl font-medium tracking-tight">
          Get a human definition for your ICD10 code
        </h3>
        <div className={cn(panelCard, "flex items-center gap-3 p-3")}>
          <Input
            value={icd10Code}
            onChange={(e) => setIcd10Code(e.target.value)}
            placeholder="Example: E83.110"
            className="border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            size="icon"
            className="rounded-full"
            disabled={isSubmitting || !icd10Code.trim()}
            onClick={() =>
              submit(
                `ICD10 assistance for code: ${icd10Code.trim()}.\n\nProvide plain-language definition, common clinical context, and coding caveats.`
              )
            }
          >
            &gt;
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className={baseShell}>
      <h3 className="mb-4 text-2xl font-medium tracking-tight">
        Add a medication and condition to generate a case for review
      </h3>
      <div className={cn(panelCard, "space-y-4 p-4")}>
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            Patient Case
            <Info className="size-3.5 text-muted-foreground" />
          </Label>
          <Textarea
            value={medReviewCase}
            onChange={(e) => setMedReviewCase(e.target.value)}
            placeholder="Type or paste your patient case for review"
            className="min-h-24 resize-y"
          />
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={isSubmitting || !medReviewCase.trim()}
          onClick={() =>
            submit(
              `Medication review request:\n${medReviewCase.trim()}\n\nPlease evaluate interactions, contraindications, optimization opportunities, and follow-up monitoring.`
            )
          }
        >
          Submit
        </Button>
      </div>
    </section>
  )
}
