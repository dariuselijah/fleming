"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import type { MedicalSpecialty, UserRole } from "@/lib/user-preference-store/utils"
import { AnimatePresence, motion } from "motion/react"
import { ArrowLeft, ArrowRight, CheckCircle, GraduationCap, Heart, Stethoscope, CaretDown } from "@phosphor-icons/react"
import { useState, useCallback, useRef, useEffect } from "react"
import { TRANSITION_SUGGESTIONS } from "@/lib/motion"
import { cn } from "@/lib/utils"

type OnboardingStep = 
  | "demographic"
  | "personal-health-communication"
  | "medical-student-use"
  | "healthcare-professional-specialty"
  | "healthcare-professional-use"
  | "complete"

type DemographicOption = "general" | "medical_student" | "doctor"

interface OnboardingDialogProps {
  open: boolean
  onComplete: () => void
}

const COMMON_SPECIALTIES: { value: MedicalSpecialty; label: string }[] = [
  { value: "family-medicine", label: "Family Medicine" },
  { value: "internal-medicine", label: "Internal Medicine" },
  { value: "emergency-medicine", label: "Emergency Medicine" },
  { value: "pediatrics", label: "Pediatrics" },
  { value: "surgery", label: "Surgery" },
  { value: "cardiology", label: "Cardiology" },
  { value: "psychiatry", label: "Psychiatry" },
]

const ALL_SPECIALTIES: { value: MedicalSpecialty; label: string }[] = [
  ...COMMON_SPECIALTIES,
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

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const { preferences, updatePreferences } = useUserPreferences()
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("demographic")
  const [selectedDemographic, setSelectedDemographic] = useState<DemographicOption | null>(null)
  const [selectedCommunication, setSelectedCommunication] = useState<string | null>(null)
  const [selectedStudentUse, setSelectedStudentUse] = useState<string | null>(null)
  const [selectedSpecialty, setSelectedSpecialty] = useState<MedicalSpecialty | null>(null)
  const [selectedProfessionalUse, setSelectedProfessionalUse] = useState<string | null>(null)
  const [specialtyPopoverOpen, setSpecialtyPopoverOpen] = useState(false)
  const [popoverWidth, setPopoverWidth] = useState<number | undefined>(undefined)
  const specialtyTriggerRef = useRef<HTMLButtonElement>(null)
  const stepHistory = useRef<OnboardingStep[]>(["demographic"])

  // Update popover width when trigger is available
  useEffect(() => {
    if (specialtyTriggerRef.current) {
      setPopoverWidth(specialtyTriggerRef.current.offsetWidth)
    }
  }, [specialtyPopoverOpen])

  const handleBack = useCallback(() => {
    if (stepHistory.current.length > 1) {
      stepHistory.current.pop() // Remove current step
      const previousStep = stepHistory.current[stepHistory.current.length - 1]
      setCurrentStep(previousStep)
    }
  }, [])

  const navigateToStep = useCallback((step: OnboardingStep) => {
    stepHistory.current.push(step)
    setCurrentStep(step)
  }, [])

  const handleDemographicSelect = useCallback((demographic: DemographicOption) => {
    setSelectedDemographic(demographic)
    
    // Set user role immediately
    updatePreferences({ userRole: demographic })
    
    // Navigate to next step based on demographic
    setTimeout(() => {
      if (demographic === "general") {
        navigateToStep("personal-health-communication")
      } else if (demographic === "medical_student") {
        navigateToStep("medical-student-use")
      } else {
        navigateToStep("healthcare-professional-specialty")
      }
    }, 300)
  }, [updatePreferences, navigateToStep])

  const handleComplete = useCallback(async () => {
    const updates: any = {
      onboardingCompleted: true,
    }

    // Set role
    if (selectedDemographic) {
      updates.userRole = selectedDemographic
    }

    // Set specialty for healthcare professionals
    if (selectedDemographic === "doctor" && selectedSpecialty) {
      updates.medicalSpecialty = selectedSpecialty
    }

    // Enable evidence features for medical students and healthcare professionals
    if (selectedDemographic === "medical_student" || selectedDemographic === "doctor") {
      updates.medicalLiteratureAccess = true
      updates.clinicalDecisionSupport = selectedDemographic === "doctor"
    }

    try {
      await updatePreferences(updates)
    } catch (error) {
      // Error is already handled by the mutation (falls back to localStorage)
      // Continue with completion even if API fails
      console.error("Error updating preferences during onboarding completion:", error)
    }
    
    navigateToStep("complete")
    
    setTimeout(() => {
      onComplete()
    }, 1000)
  }, [selectedDemographic, selectedSpecialty, updatePreferences, onComplete, navigateToStep])

  const handleNext = useCallback(() => {
    if (currentStep === "personal-health-communication" && selectedCommunication) {
      handleComplete()
    } else if (currentStep === "medical-student-use" && selectedStudentUse) {
      handleComplete()
    } else if (currentStep === "healthcare-professional-specialty" && selectedSpecialty) {
      navigateToStep("healthcare-professional-use")
    } else if (currentStep === "healthcare-professional-use" && selectedProfessionalUse) {
      handleComplete()
    }
  }, [currentStep, selectedCommunication, selectedStudentUse, selectedSpecialty, selectedProfessionalUse, handleComplete, navigateToStep])

  const canProceed = () => {
    switch (currentStep) {
      case "demographic":
        return selectedDemographic !== null
      case "personal-health-communication":
        return selectedCommunication !== null
      case "medical-student-use":
        return selectedStudentUse !== null
      case "healthcare-professional-specialty":
        return selectedSpecialty !== null
      case "healthcare-professional-use":
        return selectedProfessionalUse !== null
      default:
        return false
    }
  }

  const canGoBack = () => {
    return stepHistory.current.length > 1
  }

  const stepVariants = {
    initial: { opacity: 0, y: 20, scale: 0.96 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -20, scale: 0.96 },
  }

  const selectedSpecialtyLabel = selectedSpecialty 
    ? (ALL_SPECIALTIES.find(opt => opt.value === selectedSpecialty)?.label || "Select specialty...")
    : "Select specialty..."

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0"
        hasCloseButton={false}
      >
        <div className="relative">
          {/* Progress indicator */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-border">
            <motion.div
              className="h-full bg-[#0091FF]"
              initial={{ width: "0%" }}
              animate={{
                width: currentStep === "demographic" ? "20%" :
                       currentStep === "personal-health-communication" || currentStep === "medical-student-use" ? "50%" :
                       currentStep === "healthcare-professional-specialty" ? "50%" :
                       currentStep === "healthcare-professional-use" ? "80%" :
                       "100%"
              }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>

          <div className="p-8 pt-12">
            <AnimatePresence mode="wait">
              {currentStep === "demographic" && (
                <motion.div
                  key="demographic"
                  variants={stepVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.3 }}
                >
                  <DialogHeader className="mb-8">
                    <DialogTitle className="text-3xl font-semibold text-center bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                      Welcome to Fleming
                    </DialogTitle>
                    <DialogDescription className="text-center text-base pt-3 text-muted-foreground">
                      Let's personalize your experience
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <DemographicOption
                      icon={Heart}
                      title="For my personal health"
                      description="Get health information tailored to your needs"
                      selected={selectedDemographic === "general"}
                      onClick={() => handleDemographicSelect("general")}
                    />
                    <DemographicOption
                      icon={GraduationCap}
                      title="As a medical student"
                      description="Study support with evidence-based citations"
                      selected={selectedDemographic === "medical_student"}
                      onClick={() => handleDemographicSelect("medical_student")}
                    />
                    <DemographicOption
                      icon={Stethoscope}
                      title="As a healthcare professional"
                      description="Clinical tools with medical literature access"
                      selected={selectedDemographic === "doctor"}
                      onClick={() => handleDemographicSelect("doctor")}
                    />
                  </div>
                </motion.div>
              )}

              {currentStep === "personal-health-communication" && (
                <motion.div
                  key="personal-health-communication"
                  variants={stepVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.3 }}
                >
                  <DialogHeader className="mb-8">
                    <DialogTitle className="text-2xl font-semibold text-center">
                      How would you like information explained?
                    </DialogTitle>
                    <DialogDescription className="text-center text-base pt-3 text-muted-foreground">
                      We'll tailor our responses to your preference
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3">
                    <OptionButton
                      title="Simple, everyday language"
                      description="Easy to understand explanations"
                      selected={selectedCommunication === "simple"}
                      onClick={() => setSelectedCommunication("simple")}
                    />
                    <OptionButton
                      title="Clear with some medical terms"
                      description="Balanced explanations with context"
                      selected={selectedCommunication === "balanced"}
                      onClick={() => setSelectedCommunication("balanced")}
                    />
                    <OptionButton
                      title="Detailed and technical"
                      description="Comprehensive information when needed"
                      selected={selectedCommunication === "detailed"}
                      onClick={() => setSelectedCommunication("detailed")}
                    />
                  </div>

                  <div className="mt-8 flex items-center justify-between">
                    <Button
                      variant="ghost"
                      onClick={handleBack}
                      disabled={!canGoBack()}
                      className="gap-2"
                    >
                      <ArrowLeft className="size-4" />
                      Back
                    </Button>
                    <Button
                      onClick={handleNext}
                      disabled={!canProceed()}
                      size="lg"
                      className="min-w-[120px] gap-2"
                    >
                      Complete
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {currentStep === "medical-student-use" && (
                <motion.div
                  key="medical-student-use"
                  variants={stepVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.3 }}
                >
                  <DialogHeader className="mb-8">
                    <DialogTitle className="text-2xl font-semibold text-center">
                      What will you use Fleming for most?
                    </DialogTitle>
                    <DialogDescription className="text-center text-base pt-3 text-muted-foreground">
                      All responses include evidence-based citations from medical literature
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3">
                    <OptionButton
                      title="Studying and exam prep"
                      description="With citations to support key concepts"
                      selected={selectedStudentUse === "studying"}
                      onClick={() => setSelectedStudentUse("studying")}
                    />
                    <OptionButton
                      title="Clinical cases and rotations"
                      description="Evidence-based case analysis with references"
                      selected={selectedStudentUse === "clinical"}
                      onClick={() => setSelectedStudentUse("clinical")}
                    />
                    <OptionButton
                      title="Research and literature"
                      description="Access to latest medical journals and studies"
                      selected={selectedStudentUse === "research"}
                      onClick={() => setSelectedStudentUse("research")}
                    />
                  </div>

                  <div className="mt-8 flex items-center justify-between">
                    <Button
                      variant="ghost"
                      onClick={handleBack}
                      disabled={!canGoBack()}
                      className="gap-2"
                    >
                      <ArrowLeft className="size-4" />
                      Back
                    </Button>
                    <Button
                      onClick={handleNext}
                      disabled={!canProceed()}
                      size="lg"
                      className="min-w-[120px] gap-2"
                    >
                      Complete
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {currentStep === "healthcare-professional-specialty" && (
                <motion.div
                  key="healthcare-professional-specialty"
                  variants={stepVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.3 }}
                >
                  <DialogHeader className="mb-8">
                    <DialogTitle className="text-2xl font-semibold text-center">
                      What is your specialty?
                    </DialogTitle>
                    <DialogDescription className="text-center text-base pt-3 text-muted-foreground">
                      We'll tailor clinical information to your field
                    </DialogDescription>
                  </DialogHeader>

                  <div className="mt-6 space-y-6">
                    {/* Common specialties as chips */}
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-3 px-1">
                        Common specialties
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {COMMON_SPECIALTIES.map((specialty) => {
                          const isSelected = selectedSpecialty === specialty.value
                          return (
                            <motion.button
                              key={specialty.value}
                              onClick={() => setSelectedSpecialty(specialty.value)}
                              className={cn(
                                "px-4 py-2.5 rounded-full text-sm font-medium transition-all border-2 flex items-center gap-2 relative",
                                isSelected
                                  ? "border-[#0091FF] bg-[#0091FF]/10 dark:bg-[#0091FF]/20 text-[#0091FF] shadow-md shadow-[#0091FF]/10 dark:shadow-[#0091FF]/20"
                                  : "border-border bg-background hover:bg-accent hover:border-accent-foreground/20"
                              )}
                              whileHover={{ scale: 1.05, y: -1 }}
                              whileTap={{ scale: 0.95 }}
                              transition={TRANSITION_SUGGESTIONS}
                            >
                              {isSelected && (
                                <motion.div
                                  initial={{ scale: 0, rotate: -90 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  transition={{ type: "spring", duration: 0.3, bounce: 0.4 }}
                                >
                                  <CheckCircle className="size-4 text-[#0091FF]" weight="fill" />
                                </motion.div>
                              )}
                              {specialty.label}
                            </motion.button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Searchable dropdown for other specialties */}
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-3 px-1">
                        Other specialties
                      </div>
                      <Popover open={specialtyPopoverOpen} onOpenChange={setSpecialtyPopoverOpen}>
                        <PopoverTrigger asChild>
                          <motion.div
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            transition={TRANSITION_SUGGESTIONS}
                          >
                            <Button
                              ref={specialtyTriggerRef}
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "w-full justify-between h-14 text-base font-normal transition-all",
                                !selectedSpecialty && "text-muted-foreground",
                                specialtyPopoverOpen && "border-[#0091FF] ring-2 ring-[#0091FF]/20 dark:ring-[#0091FF]/30",
                                selectedSpecialty && !COMMON_SPECIALTIES.some(s => s.value === selectedSpecialty) && "border-[#0091FF] bg-[#0091FF]/10 dark:bg-[#0091FF]/20"
                              )}
                            >
                              <span className="truncate text-left flex-1">
                                {selectedSpecialtyLabel}
                              </span>
                              <motion.div
                                animate={{ rotate: specialtyPopoverOpen ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <CaretDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </motion.div>
                            </Button>
                          </motion.div>
                        </PopoverTrigger>
                        <PopoverContent 
                          className="p-0 shadow-xl border-2 rounded-xl overflow-hidden flex flex-col" 
                          align="start" 
                          sideOffset={8}
                          side="bottom"
                          style={{ 
                            width: popoverWidth ? `${Math.min(popoverWidth, 600)}px` : undefined,
                            maxWidth: 'min(600px, calc(100vw - 2rem))',
                            maxHeight: 'calc(100vh - 200px)'
                          }}
                          onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                          <Command className="rounded-lg">
                            <div className="border-b bg-muted/30">
                              <CommandInput 
                                placeholder="Search specialties..." 
                                className="h-16 text-lg border-0 focus:ring-0 bg-transparent px-4"
                                autoFocus
                              />
                            </div>
                            <CommandList className="max-h-[280px] sm:max-h-[360px] overflow-y-scroll">
                              <CommandEmpty className="py-10 text-center">
                                <div className="text-sm text-muted-foreground mb-1">No specialty found</div>
                                <div className="text-xs text-muted-foreground/70">Try a different search term</div>
                              </CommandEmpty>
                              <CommandGroup className="p-1">
                                {ALL_SPECIALTIES.map((specialty) => {
                                  const isSelected = selectedSpecialty === specialty.value
                                  return (
                                    <CommandItem
                                      key={specialty.value}
                                      value={specialty.label}
                                      onSelect={() => {
                                        setSelectedSpecialty(specialty.value)
                                        setSpecialtyPopoverOpen(false)
                                      }}
                                      className={cn(
                                        "cursor-pointer py-3.5 px-4 text-base rounded-lg transition-all relative",
                                        "hover:bg-accent hover:text-accent-foreground",
                                        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
                                        isSelected && "bg-[#0091FF]/10 dark:bg-[#0091FF]/20 text-[#0091FF] font-medium hover:bg-[#0091FF]/10 dark:hover:bg-[#0091FF]/20"
                                      )}
                                    >
                                      <div className="flex items-center w-full gap-3">
                                        <motion.div
                                          initial={false}
                                          animate={{
                                            scale: isSelected ? 1 : 0,
                                            opacity: isSelected ? 1 : 0,
                                          }}
                                          transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
                                          className="shrink-0"
                                        >
                                          <CheckCircle
                                            className="h-5 w-5 text-[#0091FF]"
                                            weight="fill"
                                          />
                                        </motion.div>
                                        <span className="flex-1 truncate">{specialty.label}</span>
                                      </div>
                                    </CommandItem>
                                  )
                                })}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="mt-8 flex items-center justify-between">
                    <Button
                      variant="ghost"
                      onClick={handleBack}
                      disabled={!canGoBack()}
                      className="gap-2"
                    >
                      <ArrowLeft className="size-4" />
                      Back
                    </Button>
                    <Button
                      onClick={handleNext}
                      disabled={!canProceed()}
                      size="lg"
                      className="min-w-[120px] gap-2"
                    >
                      Next
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {currentStep === "healthcare-professional-use" && (
                <motion.div
                  key="healthcare-professional-use"
                  variants={stepVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.3 }}
                >
                  <DialogHeader className="mb-8">
                    <DialogTitle className="text-2xl font-semibold text-center">
                      How will you use Fleming?
                    </DialogTitle>
                    <DialogDescription className="text-center text-base pt-3 text-muted-foreground">
                      All responses include evidence-based citations and access to medical literature
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3">
                    <OptionButton
                      title="Clinical decision support"
                      description="Evidence-based recommendations with citations"
                      selected={selectedProfessionalUse === "clinical"}
                      onClick={() => setSelectedProfessionalUse("clinical")}
                    />
                    <OptionButton
                      title="Patient education"
                      description="Create clear explanations with source references"
                      selected={selectedProfessionalUse === "patient"}
                      onClick={() => setSelectedProfessionalUse("patient")}
                    />
                    <OptionButton
                      title="Research and staying current"
                      description="Access latest medical journals and studies"
                      selected={selectedProfessionalUse === "research"}
                      onClick={() => setSelectedProfessionalUse("research")}
                    />
                    <OptionButton
                      title="All of the above"
                      description="I'll use Fleming for multiple purposes"
                      selected={selectedProfessionalUse === "all"}
                      onClick={() => setSelectedProfessionalUse("all")}
                    />
                  </div>

                  <div className="mt-8 flex items-center justify-between">
                    <Button
                      variant="ghost"
                      onClick={handleBack}
                      disabled={!canGoBack()}
                      className="gap-2"
                    >
                      <ArrowLeft className="size-4" />
                      Back
                    </Button>
                    <Button
                      onClick={handleNext}
                      disabled={!canProceed()}
                      size="lg"
                      className="min-w-[120px] gap-2"
                    >
                      Complete
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {currentStep === "complete" && (
                <motion.div
                  key="complete"
                  variants={stepVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ ...TRANSITION_SUGGESTIONS, duration: 0.3 }}
                  className="text-center py-12"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", duration: 0.6, bounce: 0.3 }}
                  >
                    <CheckCircle className="mx-auto size-20 text-[#0091FF] mb-6" weight="fill" />
                  </motion.div>
                  <DialogTitle className="text-3xl font-semibold mb-3">
                    You're all set!
                  </DialogTitle>
                  <DialogDescription className="text-base text-lg">
                    Fleming is now personalized for you
                  </DialogDescription>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface DemographicOptionProps {
  icon: React.ComponentType<{ className?: string; weight?: "fill" | "regular" | "bold" | "duotone" | "light" }>
  title: string
  description: string
  selected: boolean
  onClick: () => void
}

function DemographicOption({ icon: Icon, title, description, selected, onClick }: DemographicOptionProps) {
  return (
    <motion.button
      onClick={onClick}
      className={cn(
        "w-full p-5 rounded-2xl border-2 text-left transition-all relative overflow-hidden",
        selected 
          ? "border-[#0091FF] bg-[#0091FF]/10 dark:bg-[#0091FF]/20 text-[#0091FF] shadow-lg shadow-[#0091FF]/10 dark:shadow-[#0091FF]/20" 
          : "border-border bg-background hover:bg-accent hover:border-accent-foreground/20"
      )}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={TRANSITION_SUGGESTIONS}
    >
      {selected && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-[#0091FF]/5 dark:from-[#0091FF]/10 to-transparent"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      )}
      <div className="flex items-start gap-4 relative z-10">
        <div className={cn(
          "p-3 rounded-xl transition-all",
          selected ? "bg-[#0091FF]/10 dark:bg-[#0091FF]/20" : "bg-muted"
        )}>
          <Icon className={cn("size-6", selected ? "text-[#0091FF]" : "")} weight={selected ? "fill" : "regular"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-lg mb-1">{title}</div>
          <div className={cn(
            "text-sm leading-relaxed",
            selected ? "text-[#0091FF] dark:text-[#0091FF]" : "text-muted-foreground"
          )}>
            {description}
          </div>
        </div>
        {selected && (
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.4 }}
            className="shrink-0"
          >
            <CheckCircle className="size-6 text-[#0091FF]" weight="fill" />
          </motion.div>
        )}
      </div>
    </motion.button>
  )
}

interface OptionButtonProps {
  title: string
  description?: string
  selected: boolean
  onClick: () => void
}

function OptionButton({ title, description, selected, onClick }: OptionButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      className={cn(
        "w-full p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden",
        selected 
          ? "border-[#0091FF] bg-[#0091FF]/10 dark:bg-[#0091FF]/20 text-[#0091FF] shadow-md shadow-[#0091FF]/5 dark:shadow-[#0091FF]/10" 
          : "border-border bg-background hover:bg-accent hover:border-accent-foreground/20"
      )}
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.99 }}
      transition={TRANSITION_SUGGESTIONS}
    >
      {selected && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-[#0091FF]/5 dark:from-[#0091FF]/10 to-transparent"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      )}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-base">{title}</div>
          {description && (
            <div className={cn(
              "text-sm mt-1 leading-relaxed",
              selected ? "text-[#0091FF] dark:text-[#0091FF]" : "text-muted-foreground"
            )}>
              {description}
            </div>
          )}
        </div>
        {selected && (
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.4 }}
            className="shrink-0 ml-4"
          >
            <CheckCircle className="size-5 text-[#0091FF]" weight="fill" />
          </motion.div>
        )}
      </div>
    </motion.button>
  )
}
