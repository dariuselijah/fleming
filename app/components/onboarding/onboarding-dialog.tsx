"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import {
  CLINICIAN_MODE_DESCRIPTIONS,
  CLINICIAN_MODE_LABELS,
  CLINICIAN_WORKFLOW_MODES,
} from "@/lib/clinician-mode"
import type {
  MedicalSpecialty,
  UserPreferences,
  UserRole,
} from "@/lib/user-preference-store/utils"
import { TRANSITION_SUGGESTIONS } from "@/lib/motion"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  GraduationCap,
  Heart,
  Stethoscope,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"

type OnboardingStep = "role" | "details" | "walkthrough" | "complete"

type WalkthroughSlide = {
  id: string
  kicker: string
  title: string
  description: string
  bullets: string[]
  highlight?: string
}

interface OnboardingDialogProps {
  open: boolean
  onComplete: () => void
}

const ALL_SPECIALTIES: { value: MedicalSpecialty; label: string }[] = [
  { value: "family-medicine", label: "Family Medicine" },
  { value: "internal-medicine", label: "Internal Medicine" },
  { value: "emergency-medicine", label: "Emergency Medicine" },
  { value: "pediatrics", label: "Pediatrics" },
  { value: "surgery", label: "Surgery" },
  { value: "cardiology", label: "Cardiology" },
  { value: "psychiatry", label: "Psychiatry" },
  { value: "oncology", label: "Oncology" },
  { value: "neurology", label: "Neurology" },
  { value: "orthopedics", label: "Orthopedics" },
  { value: "dermatology", label: "Dermatology" },
  { value: "radiology", label: "Radiology" },
  { value: "pathology", label: "Pathology" },
  { value: "anesthesiology", label: "Anesthesiology" },
  { value: "obstetrics-gynecology", label: "Obstetrics & Gynecology" },
  { value: "general", label: "Other / General" },
]

const STUDENT_YEAR_OPTIONS = [
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4",
  "Intern",
  "Resident",
]

const GENERAL_WALKTHROUGH: WalkthroughSlide[] = [
  {
    id: "general-capabilities",
    kicker: "Personalized guidance",
    title: "What you can use Fleming for",
    description:
      "Use Fleming for everyday health education, symptom context, and preparing for better conversations with your care team.",
    bullets: [
      "Get clear explanations in plain language.",
      "Compare options and understand risks and benefits.",
      "Bring your own questions and receive structured answers.",
    ],
    highlight:
      "Fleming is educational support and does not replace in-person emergency care.",
  },
  {
    id: "general-evidence",
    kicker: "Evidence grounded",
    title: "Understand where answers come from",
    description:
      "When medical evidence is available, Fleming can provide source-aware responses and make the rationale easier to follow.",
    bullets: [
      "Source-linked medical context where available.",
      "Short, readable summaries with practical takeaways.",
      "Follow-up prompts to clarify what matters most to you.",
    ],
  },
]

const STUDENT_WALKTHROUGH: WalkthroughSlide[] = [
  {
    id: "student-feature-map",
    kicker: "Feature map",
    title: "Your med-student workspace",
    description:
      "You will get a full learning cockpit with focused modes, transparent tool outputs, and citation-aware answers.",
    bullets: [
      "Switch quickly between learning modes.",
      "See tool outputs for search and retrieval steps.",
      "Keep every study thread structured and reproducible.",
    ],
  },
  {
    id: "student-uploads",
    kicker: "Upload-first learning",
    title: "Upload slides, notes, and textbooks",
    description:
      "Add your own lecture decks and documents, then ask grounded questions directly against your uploaded material.",
    bullets: [
      "Upload PDFs, slides, docs, and images.",
      "Use your own notes as study context.",
      "Receive evidence-based answers tied to your files.",
    ],
  },
  {
    id: "student-slash-reference",
    kicker: "Fast referencing",
    title: "Reference uploads with / in chat",
    description:
      "Type / in the composer to quickly find an upload and insert it into the question context without leaving chat.",
    bullets: [
      "Use slash search to pick uploads instantly.",
      "Combine up to multiple references in one prompt.",
      "Keep your prompts clean while keeping context rich.",
    ],
  },
  {
    id: "student-artifacts",
    kicker: "Artifacts",
    title: "Generate study documents and MCQ quizzes",
    description:
      "Ask Fleming to create polished summaries, revision notes, and interactive quiz sets from your selected uploads.",
    bullets: [
      "Generate structured study documents.",
      "Create multiple-choice quizzes with explanations.",
      "Export learning artifacts when needed.",
    ],
  },
  {
    id: "student-youtube-search",
    kicker: "Multimodal learning",
    title: "Search YouTube and blend with evidence",
    description:
      "Use web and video discovery to pull relevant educational videos, then cross-check key points against your uploaded sources.",
    bullets: [
      "Find high-yield videos from chat.",
      "Pair video learning with textbook evidence.",
      "Turn passive watching into active retrieval practice.",
    ],
  },
]

function parseCommaSeparatedItems(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12)
}

function buildClinicianWalkthroughSlides(
  specialtyLabel: string
): WalkthroughSlide[] {
  const intro: WalkthroughSlide = {
    id: "clinician-intro",
    kicker: specialtyLabel,
    title: "Your clinician command center",
    description:
      "Each clinician tab is tuned for a specific workflow so you can move from question to action quickly and safely.",
    bullets: [
      "Structured, tab-specific workflow support.",
      "Evidence-aware responses with practical outputs.",
      "Clear handling of uncertainty and missing data.",
    ],
  }

  const tabSlides = CLINICIAN_WORKFLOW_MODES.map((mode) => {
    const details = CLINICIAN_MODE_DESCRIPTIONS[mode]
    return {
      id: `clinician-${mode}`,
      kicker: "Clinician tabs",
      title: CLINICIAN_MODE_LABELS[mode],
      description: details.tagline,
      bullets: [
        ...details.keyOutputs.slice(0, 3),
        details.trustClaim,
      ],
      highlight: details.benchmarkBacked
        ? "Benchmark-backed workflow guidance is enabled for this tab."
        : undefined,
    } satisfies WalkthroughSlide
  })

  return [intro, ...tabSlides]
}

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const { updatePreferences } = useUserPreferences()

  const [currentStep, setCurrentStep] = useState<OnboardingStep>("role")
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
  const [generalHealthContext, setGeneralHealthContext] = useState("")
  const [generalHealthConditions, setGeneralHealthConditions] = useState("")
  const [studentSchool, setStudentSchool] = useState("")
  const [studentYear, setStudentYear] = useState("")
  const [clinicianName, setClinicianName] = useState("")
  const [selectedSpecialty, setSelectedSpecialty] =
    useState<MedicalSpecialty | null>(null)
  const [walkthroughIndex, setWalkthroughIndex] = useState(0)
  const [isSaving, setIsSaving] = useState(false)

  const selectedSpecialtyLabel = useMemo(() => {
    if (!selectedSpecialty) return "General practice"
    return (
      ALL_SPECIALTIES.find((specialty) => specialty.value === selectedSpecialty)
        ?.label || "General practice"
    )
  }, [selectedSpecialty])

  const walkthroughSlides = useMemo(() => {
    if (selectedRole === "general") return GENERAL_WALKTHROUGH
    if (selectedRole === "medical_student") return STUDENT_WALKTHROUGH
    if (selectedRole === "doctor") {
      return buildClinicianWalkthroughSlides(selectedSpecialtyLabel)
    }
    return []
  }, [selectedRole, selectedSpecialtyLabel])

  const activeSlide = walkthroughSlides[walkthroughIndex]

  const resetState = useCallback(() => {
    setCurrentStep("role")
    setSelectedRole(null)
    setGeneralHealthContext("")
    setGeneralHealthConditions("")
    setStudentSchool("")
    setStudentYear("")
    setClinicianName("")
    setSelectedSpecialty(null)
    setWalkthroughIndex(0)
    setIsSaving(false)
  }, [])

  useEffect(() => {
    if (!open) return
    resetState()
  }, [open, resetState])

  const canProceed = useMemo(() => {
    if (currentStep === "role") {
      return selectedRole !== null
    }
    if (currentStep === "details") {
      if (selectedRole === "general") {
        return generalHealthContext.trim().length >= 10
      }
      if (selectedRole === "medical_student") {
        return studentSchool.trim().length > 1 && studentYear.length > 0
      }
      if (selectedRole === "doctor") {
        return clinicianName.trim().length > 1 && selectedSpecialty !== null
      }
      return false
    }
    if (currentStep === "walkthrough") {
      return walkthroughSlides.length > 0
    }
    return false
  }, [
    currentStep,
    selectedRole,
    generalHealthContext,
    studentSchool,
    studentYear,
    clinicianName,
    selectedSpecialty,
    walkthroughSlides.length,
  ])

  const progress = useMemo(() => {
    if (currentStep === "role") return 20
    if (currentStep === "details") return 48
    if (currentStep === "walkthrough") {
      if (!walkthroughSlides.length) return 60
      return 48 + ((walkthroughIndex + 1) / walkthroughSlides.length) * 40
    }
    return 100
  }, [currentStep, walkthroughIndex, walkthroughSlides.length])

  const handleFinish = useCallback(() => {
    if (!selectedRole || isSaving) return

    const updates: Partial<UserPreferences> = {
      userRole: selectedRole,
      onboardingCompleted: true,
    }

    if (selectedRole === "general") {
      updates.healthContext = generalHealthContext.trim()
      updates.healthConditions = parseCommaSeparatedItems(generalHealthConditions)
      updates.medicalSpecialty = "general"
      updates.medicalLiteratureAccess = false
      updates.clinicalDecisionSupport = false
      updates.studentSchool = ""
      updates.studentYear = ""
      updates.clinicianName = ""
    }

    if (selectedRole === "medical_student") {
      updates.studentSchool = studentSchool.trim()
      updates.studentYear = studentYear
      updates.medicalLiteratureAccess = true
      updates.clinicalDecisionSupport = false
      updates.clinicianName = ""

      if (typeof window !== "undefined") {
        window.localStorage.setItem("medical-student-learning-mode", "ask")
      }
    }

    if (selectedRole === "doctor") {
      updates.clinicianName = clinicianName.trim()
      updates.medicalSpecialty = selectedSpecialty || "general"
      updates.medicalLiteratureAccess = true
      updates.clinicalDecisionSupport = true
      updates.studentSchool = ""
      updates.studentYear = ""
    }

    setCurrentStep("complete")
    setIsSaving(true)

    updatePreferences(updates)
      .catch((error) => {
        console.error("Error saving onboarding preferences:", error)
      })
      .finally(() => {
        setIsSaving(false)
      })

    setTimeout(() => {
      onComplete()
    }, 1200)
  }, [
    selectedRole,
    isSaving,
    generalHealthContext,
    generalHealthConditions,
    studentSchool,
    studentYear,
    clinicianName,
    selectedSpecialty,
    updatePreferences,
    onComplete,
  ])

  const handleNext = useCallback(() => {
    if (!canProceed) return

    if (currentStep === "role") {
      setCurrentStep("details")
      return
    }

    if (currentStep === "details") {
      setWalkthroughIndex(0)
      setCurrentStep("walkthrough")
      return
    }

    if (currentStep === "walkthrough") {
      const isLastSlide = walkthroughIndex >= walkthroughSlides.length - 1
      if (isLastSlide) {
        handleFinish()
        return
      }
      setWalkthroughIndex((prev) => prev + 1)
    }
  }, [
    canProceed,
    currentStep,
    handleFinish,
    walkthroughIndex,
    walkthroughSlides.length,
  ])

  const handleBack = useCallback(() => {
    if (currentStep === "details") {
      setCurrentStep("role")
      return
    }

    if (currentStep === "walkthrough") {
      if (walkthroughIndex > 0) {
        setWalkthroughIndex((prev) => prev - 1)
      } else {
        setCurrentStep("details")
      }
    }
  }, [currentStep, walkthroughIndex])

  const nextLabel =
    currentStep === "walkthrough" &&
    walkthroughIndex === walkthroughSlides.length - 1
      ? "Finish onboarding"
      : "Continue"

  const canGoBack = currentStep === "details" || currentStep === "walkthrough"

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        hasCloseButton={false}
        className="sm:max-w-3xl max-h-[92vh] overflow-y-auto p-0 border-0"
      >
        <div className="relative rounded-2xl border border-border bg-gradient-to-b from-background via-background to-muted/20">
          <div className="absolute left-0 right-0 top-0 h-1 bg-border">
            <motion.div
              className="h-full bg-[#0091FF]"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.32, ease: "easeOut" }}
            />
          </div>

          <div className="p-5 pt-10 sm:p-8 sm:pt-12">
            <AnimatePresence mode="wait">
              {currentStep === "role" && (
                <motion.div
                  key="role-step"
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16, scale: 0.98 }}
                  transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.28 }}
                >
                  <DialogHeader className="mb-7">
                    <DialogTitle className="text-center text-3xl font-semibold tracking-tight">
                      Welcome to Fleming
                    </DialogTitle>
                    <DialogDescription className="pt-2 text-center text-base">
                      Choose your role so we can tailor an Apple-level experience
                      from the first message.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-3">
                    <RoleCard
                      icon={Heart}
                      title="General user"
                      description="Personalized health guidance with clear explanations."
                      selected={selectedRole === "general"}
                      onClick={() => setSelectedRole("general")}
                    />
                    <RoleCard
                      icon={GraduationCap}
                      title="Medical student"
                      description="Animated feature walkthrough with uploads, tool calls, and evidence workflows."
                      selected={selectedRole === "medical_student"}
                      onClick={() => setSelectedRole("medical_student")}
                    />
                    <RoleCard
                      icon={Stethoscope}
                      title="Clinician"
                      description="Tab-by-tab workflow onboarding for clinical use cases."
                      selected={selectedRole === "doctor"}
                      onClick={() => setSelectedRole("doctor")}
                    />
                  </div>
                </motion.div>
              )}

              {currentStep === "details" && (
                <motion.div
                  key="details-step"
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16, scale: 0.98 }}
                  transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.28 }}
                  className="space-y-5"
                >
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-semibold tracking-tight">
                      {selectedRole === "general" && "Tell us your health context"}
                      {selectedRole === "medical_student" &&
                        "Tell us about your medical training"}
                      {selectedRole === "doctor" &&
                        "Tell us about your clinical profile"}
                    </DialogTitle>
                    <DialogDescription className="pt-2 text-sm sm:text-base">
                      We only collect what is needed to personalize your results.
                    </DialogDescription>
                  </DialogHeader>

                  {selectedRole === "general" && (
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="general-health-context">
                          General health information (required)
                        </Label>
                        <Textarea
                          id="general-health-context"
                          value={generalHealthContext}
                          onChange={(event) =>
                            setGeneralHealthContext(event.target.value)
                          }
                          placeholder="Example: I want practical explanations about blood pressure, nutrition, sleep, and preventive care."
                          className="min-h-28 resize-y"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="general-health-conditions">
                          Health conditions (optional, comma-separated)
                        </Label>
                        <Input
                          id="general-health-conditions"
                          value={generalHealthConditions}
                          onChange={(event) =>
                            setGeneralHealthConditions(event.target.value)
                          }
                          placeholder="Example: hypertension, asthma"
                        />
                      </div>
                    </div>
                  )}

                  {selectedRole === "medical_student" && (
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="student-school">Medical school</Label>
                        <Input
                          id="student-school"
                          value={studentSchool}
                          onChange={(event) => setStudentSchool(event.target.value)}
                          placeholder="Enter your school"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Current year</Label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {STUDENT_YEAR_OPTIONS.map((year) => {
                            const active = studentYear === year
                            return (
                              <button
                                key={year}
                                type="button"
                                onClick={() => setStudentYear(year)}
                                className={cn(
                                  "rounded-xl border px-3 py-2 text-sm text-left transition",
                                  active
                                    ? "border-[#0091FF] bg-[#0091FF]/10 text-[#0091FF]"
                                    : "border-border bg-background hover:bg-accent"
                                )}
                              >
                                {year}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedRole === "doctor" && (
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="clinician-name">
                          Clinician name (required)
                        </Label>
                        <Input
                          id="clinician-name"
                          value={clinicianName}
                          onChange={(event) => setClinicianName(event.target.value)}
                          placeholder="Enter your name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Specialty (required)</Label>
                        <Select
                          value={selectedSpecialty || undefined}
                          onValueChange={(value) =>
                            setSelectedSpecialty(value as MedicalSpecialty)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select your specialty" />
                          </SelectTrigger>
                          <SelectContent>
                            {ALL_SPECIALTIES.map((specialty) => (
                              <SelectItem
                                key={specialty.value}
                                value={specialty.value}
                              >
                                {specialty.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {currentStep === "walkthrough" && activeSlide && (
                <motion.div
                  key="walkthrough-step"
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16, scale: 0.98 }}
                  transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.28 }}
                  className="space-y-5"
                >
                  <DialogHeader className="space-y-2">
                    <DialogTitle className="text-2xl font-semibold tracking-tight">
                      {selectedRole === "general" && "Your personalized experience"}
                      {selectedRole === "medical_student" &&
                        "The super cool features for med students"}
                      {selectedRole === "doctor" &&
                        "Clinician features, tab by tab"}
                    </DialogTitle>
                    <DialogDescription className="text-sm sm:text-base">
                      Slide {walkthroughIndex + 1} of {walkthroughSlides.length}
                    </DialogDescription>
                  </DialogHeader>

                  {selectedRole === "doctor" && (
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-background to-transparent sm:hidden" />
                      <div className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-background to-transparent sm:hidden" />
                      <div className="overflow-x-auto pb-1 px-1 sm:px-0">
                        <div className="inline-flex min-w-max gap-1.5 sm:gap-2 lg:min-w-0 lg:flex-wrap">
                        {walkthroughSlides.map((slide, index) => (
                          <button
                            key={slide.id}
                            type="button"
                            onClick={() => setWalkthroughIndex(index)}
                            className={cn(
                              "rounded-full border px-2.5 py-1.5 text-[11px] sm:px-3 sm:text-xs transition whitespace-nowrap",
                              walkthroughIndex === index
                                ? "border-[#0091FF] bg-[#0091FF]/12 text-[#0091FF] shadow-sm"
                                : "border-border/80 bg-background text-muted-foreground hover:bg-accent"
                            )}
                          >
                            {index === 0
                              ? "Overview"
                              : slide.title}
                          </button>
                        ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeSlide.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.24 }}
                      className="rounded-2xl border border-border bg-background/80 p-4 sm:p-6"
                    >
                      <Badge variant="outline" className="mb-3">
                        {activeSlide.kicker}
                      </Badge>
                      <h3 className="text-xl font-semibold tracking-tight">
                        {activeSlide.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                        {activeSlide.description}
                      </p>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {activeSlide.bullets.map((bullet) => (
                          <div
                            key={bullet}
                            className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/25 px-3 py-2"
                          >
                            <CheckCircle
                              className="mt-0.5 size-4 shrink-0 text-[#0091FF]"
                              weight="fill"
                            />
                            <span className="text-sm leading-relaxed">{bullet}</span>
                          </div>
                        ))}
                      </div>
                      {activeSlide.highlight ? (
                        <div className="mt-4 rounded-xl border border-[#0091FF]/30 bg-[#0091FF]/10 px-3 py-2 text-sm text-[#0074CC] dark:text-[#66B8FF]">
                          {activeSlide.highlight}
                        </div>
                      ) : null}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              )}

              {currentStep === "complete" && (
                <motion.div
                  key="complete-step"
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16, scale: 0.98 }}
                  transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.28 }}
                  className="py-10 text-center"
                >
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
                  >
                    <CheckCircle
                      className="mx-auto mb-5 size-20 text-[#0091FF]"
                      weight="fill"
                    />
                  </motion.div>
                  <DialogTitle className="text-3xl font-semibold tracking-tight">
                    You are all set
                  </DialogTitle>
                  <DialogDescription className="mt-2 text-base">
                    Fleming is now tailored to your role and workflow.
                  </DialogDescription>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {isSaving ? "Saving your preferences..." : "Launching your workspace..."}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {currentStep !== "complete" && (
              <div className="mt-7 flex items-center justify-between">
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  disabled={!canGoBack || isSaving}
                  className="gap-2"
                >
                  <ArrowLeft className="size-4" />
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={!canProceed || isSaving}
                  size="lg"
                  className="min-w-[150px] gap-2"
                >
                  {nextLabel}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface RoleCardProps {
  icon: React.ComponentType<{
    className?: string
    weight?: "fill" | "regular" | "bold" | "duotone" | "light"
  }>
  title: string
  description: string
  selected: boolean
  onClick: () => void
}

function RoleCard({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
}: RoleCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.99 }}
      transition={TRANSITION_SUGGESTIONS}
      className={cn(
        "w-full rounded-2xl border-2 p-4 text-left transition sm:p-5",
        selected
          ? "border-[#0091FF] bg-[#0091FF]/10 text-[#0074CC] shadow-md shadow-[#0091FF]/20 dark:text-[#66B8FF]"
          : "border-border bg-background hover:bg-accent"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "rounded-xl p-2.5",
            selected ? "bg-[#0091FF]/15" : "bg-muted"
          )}
        >
          <Icon
            className={cn("size-5", selected ? "text-[#0091FF]" : "text-foreground")}
            weight={selected ? "fill" : "regular"}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold sm:text-lg">{title}</div>
          <div className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {description}
          </div>
        </div>
      </div>
    </motion.button>
  )
}
