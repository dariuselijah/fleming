"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
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
  Sparkle,
  Stethoscope,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"

type OnboardingStep = "role" | "profile" | "review" | "complete"

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

const PROFILE_HINTS: Record<
  UserRole,
  { title: string; lines: string[] }
> = {
  general: {
    title: "How we’ll help",
    lines: [
      "Plain-language explanations and structured answers.",
      "Source-aware medical context when evidence is available.",
      "Educational only — not emergency care or a diagnosis.",
    ],
  },
  medical_student: {
    title: "Learning workspace",
    lines: [
      "Upload notes and PDFs, then ask grounded questions.",
      "Slash commands in chat to pull uploads into context fast.",
      "Artifacts for summaries, notes, and MCQ-style review.",
    ],
  },
  doctor: {
    title: "Clinical workspace",
    lines: [
      "Admin, calendar, and encrypted patient chart when you unlock your practice.",
      "Evidence tools and clinician modes tuned to your specialty.",
      "Patient-scoped consult chat stays tied to the active chart.",
    ],
  },
}

function parseCommaSeparatedItems(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12)
}

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const { updatePreferences } = useUserPreferences()
  const [mounted, setMounted] = useState(false)

  const [currentStep, setCurrentStep] = useState<OnboardingStep>("role")
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
  const [generalHealthContext, setGeneralHealthContext] = useState("")
  const [generalHealthConditions, setGeneralHealthConditions] = useState("")
  const [studentSchool, setStudentSchool] = useState("")
  const [studentYear, setStudentYear] = useState("")
  const [clinicianName, setClinicianName] = useState("")
  const [selectedSpecialty, setSelectedSpecialty] =
    useState<MedicalSpecialty | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const selectedSpecialtyLabel = useMemo(() => {
    if (!selectedSpecialty) return "General practice"
    return (
      ALL_SPECIALTIES.find((specialty) => specialty.value === selectedSpecialty)
        ?.label || "General practice"
    )
  }, [selectedSpecialty])

  useEffect(() => {
    setMounted(true)
  }, [])

  const resetState = useCallback(() => {
    setCurrentStep("role")
    setSelectedRole(null)
    setGeneralHealthContext("")
    setGeneralHealthConditions("")
    setStudentSchool("")
    setStudentYear("")
    setClinicianName("")
    setSelectedSpecialty(null)
    setIsSaving(false)
  }, [])

  useEffect(() => {
    if (!open) return
    resetState()
  }, [open, resetState])

  const canProceed = useMemo(() => {
    if (currentStep === "role") return Boolean(selectedRole)
    if (currentStep === "profile") {
      if (!selectedRole) return false
      if (selectedRole === "general")
        return generalHealthContext.trim().length >= 12
      if (selectedRole === "medical_student")
        return studentSchool.trim().length > 0 && studentYear.length > 0
      if (selectedRole === "doctor")
        return (
          clinicianName.trim().length > 0 &&
          Boolean(selectedSpecialty)
        )
      return false
    }
    if (currentStep === "review") return true
    return false
  }, [
    currentStep,
    selectedRole,
    generalHealthContext,
    studentSchool,
    studentYear,
    clinicianName,
    selectedSpecialty,
  ])

  const progress = useMemo(() => {
    if (currentStep === "role") return 22
    if (currentStep === "profile") return 55
    if (currentStep === "review") return 82
    return 100
  }, [currentStep])

  const stepIndex = currentStep === "role" ? 0 : currentStep === "profile" ? 1 : currentStep === "review" ? 2 : 3

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
    }, 1100)
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
      setCurrentStep("profile")
      return
    }

    if (currentStep === "profile") {
      setCurrentStep("review")
      return
    }

    if (currentStep === "review") {
      handleFinish()
    }
  }, [canProceed, currentStep, handleFinish])

  const handleBack = useCallback(() => {
    if (currentStep === "profile") {
      setCurrentStep("role")
      return
    }
    if (currentStep === "review") {
      setCurrentStep("profile")
    }
  }, [currentStep])

  const nextLabel =
    currentStep === "review" ? "Get started" : "Continue"

  const canGoBack = currentStep === "profile" || currentStep === "review"

  const hints = selectedRole ? PROFILE_HINTS[selectedRole] : null

  if (!open || !mounted) return null

  const overlay = (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-md"
        aria-hidden
      />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex max-h-[min(640px,92vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl sm:max-w-xl"
      >
        <div className="h-1 w-full bg-border">
          <motion.div
            className="h-full bg-primary"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.32, ease: "easeOut" }}
          />
        </div>

        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3 sm:px-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkle className="size-4 text-primary" weight="duotone" />
            <span className="text-[11px] font-medium uppercase tracking-wider">
              Setup · Step {Math.min(stepIndex + 1, 3)} of 3
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
          <AnimatePresence mode="wait">
            {currentStep === "role" && (
              <motion.div
                key="role-step"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.26 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <h2
                    id="onboarding-title"
                    className="text-2xl font-semibold tracking-tight sm:text-3xl"
                  >
                    Welcome to Fleming
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                    Pick how you’ll use the product. You can change this later in settings.
                  </p>
                </div>

                <div className="grid gap-3">
                  <RoleCard
                    icon={Heart}
                    title="For myself"
                    description="Health education, clear explanations, and evidence when available."
                    selected={selectedRole === "general"}
                    onClick={() => setSelectedRole("general")}
                  />
                  <RoleCard
                    icon={GraduationCap}
                    title="Medical student"
                    description="Uploads, learning modes, and citation-aware study workflows."
                    selected={selectedRole === "medical_student"}
                    onClick={() => setSelectedRole("medical_student")}
                  />
                  <RoleCard
                    icon={Stethoscope}
                    title="Clinician"
                    description="Clinical workspace, consult chat, and specialty-tuned tools."
                    selected={selectedRole === "doctor"}
                    onClick={() => setSelectedRole("doctor")}
                  />
                </div>
              </motion.div>
            )}

            {currentStep === "profile" && selectedRole && (
              <motion.div
                key="profile-step"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.26 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                    {selectedRole === "general" && "Your health focus"}
                    {selectedRole === "medical_student" && "Your training"}
                    {selectedRole === "doctor" && "Your practice profile"}
                  </h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Only what we need to personalize answers. Stored with your account.
                  </p>
                </div>

                {selectedRole === "general" && (
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="general-health-context">
                        What should we prioritize? (a few sentences)
                      </Label>
                      <Textarea
                        id="general-health-context"
                        value={generalHealthContext}
                        onChange={(e) => setGeneralHealthContext(e.target.value)}
                        placeholder="e.g. Blood pressure, sleep, nutrition, preparing for specialist visits…"
                        className="min-h-[120px] resize-y"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        At least 12 characters.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="general-health-conditions">
                        Conditions (optional, comma-separated)
                      </Label>
                      <Input
                        id="general-health-conditions"
                        value={generalHealthConditions}
                        onChange={(e) => setGeneralHealthConditions(e.target.value)}
                        placeholder="e.g. hypertension, asthma"
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
                        onChange={(e) => setStudentSchool(e.target.value)}
                        placeholder="School name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Year</Label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {STUDENT_YEAR_OPTIONS.map((year) => {
                          const active = studentYear === year
                          return (
                            <button
                              key={year}
                              type="button"
                              onClick={() => setStudentYear(year)}
                              className={cn(
                                "rounded-xl border px-3 py-2.5 text-left text-sm transition",
                                active
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-background hover:bg-muted/60"
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
                      <Label htmlFor="clinician-name">Name as shown to patients / team</Label>
                      <Input
                        id="clinician-name"
                        value={clinicianName}
                        onChange={(e) => setClinicianName(e.target.value)}
                        placeholder="Dr. …"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Specialty</Label>
                      <Select
                        value={selectedSpecialty || undefined}
                        onValueChange={(value) =>
                          setSelectedSpecialty(value as MedicalSpecialty)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select specialty" />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_SPECIALTIES.map((specialty) => (
                            <SelectItem key={specialty.value} value={specialty.value}>
                              {specialty.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {hints && (
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {hints.title}
                    </p>
                    <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                      {hints.lines.map((line) => (
                        <li key={line} className="flex gap-2">
                          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/80" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            )}

            {currentStep === "review" && selectedRole && (
              <motion.div
                key="review-step"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.26 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                    You’re ready
                  </h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Here’s how we’ll tailor Fleming. Tap <strong>Get started</strong> to save.
                  </p>
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4 text-sm">
                  <div className="flex justify-between gap-4 border-b border-border/60 pb-3">
                    <span className="text-muted-foreground">Role</span>
                    <span className="font-medium text-right">
                      {selectedRole === "general" && "Personal health"}
                      {selectedRole === "medical_student" && "Medical student"}
                      {selectedRole === "doctor" && "Clinician"}
                    </span>
                  </div>
                  {selectedRole === "general" && (
                    <>
                      <div>
                        <span className="text-muted-foreground">Focus</span>
                        <p className="mt-1 line-clamp-4 text-foreground/90">
                          {generalHealthContext.trim()}
                        </p>
                      </div>
                      {generalHealthConditions.trim() ? (
                        <div>
                          <span className="text-muted-foreground">Conditions</span>
                          <p className="mt-1">{generalHealthConditions}</p>
                        </div>
                      ) : null}
                    </>
                  )}
                  {selectedRole === "medical_student" && (
                    <>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">School</span>
                        <span className="font-medium text-right">{studentSchool}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Year</span>
                        <span className="font-medium">{studentYear}</span>
                      </div>
                    </>
                  )}
                  {selectedRole === "doctor" && (
                    <>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Name</span>
                        <span className="font-medium text-right">{clinicianName}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Specialty</span>
                        <span className="font-medium text-right">
                          {selectedSpecialtyLabel}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {selectedRole === "general" ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Fleming provides educational information only. It does not replace emergency
                    services or your clinician’s judgment.
                  </p>
                ) : null}
              </motion.div>
            )}

            {currentStep === "complete" && (
              <motion.div
                key="complete-step"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center py-10 text-center"
              >
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", duration: 0.5, bounce: 0.35 }}
                >
                  <CheckCircle
                    className="mx-auto mb-5 size-16 text-primary sm:size-20"
                    weight="fill"
                  />
                </motion.div>
                <h2 className="text-2xl font-semibold tracking-tight">All set</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isSaving ? "Saving your preferences…" : "Opening your workspace…"}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {currentStep !== "complete" && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-card/95 px-5 py-4 sm:px-8">
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
              className="min-w-[140px] gap-2"
            >
              {nextLabel}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  )

  return createPortal(overlay, document.body)
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
      whileHover={{ scale: 1.008, y: -1 }}
      whileTap={{ scale: 0.995 }}
      transition={TRANSITION_SUGGESTIONS}
      className={cn(
        "w-full rounded-2xl border-2 p-4 text-left transition sm:p-5",
        selected
          ? "border-primary bg-primary/10 text-primary shadow-md shadow-primary/15"
          : "border-border bg-background hover:bg-muted/50"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "rounded-xl p-2.5",
            selected ? "bg-primary/15" : "bg-muted"
          )}
        >
          <Icon
            className={cn("size-5", selected ? "text-primary" : "text-foreground")}
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
