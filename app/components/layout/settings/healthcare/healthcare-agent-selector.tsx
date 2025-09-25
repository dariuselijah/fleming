"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import {
  StethoscopeIcon,
  UserIcon,
  BookOpenIcon
} from "@phosphor-icons/react"


const specialtyLabels: Record<string, string> = {
  "cardiology": "Cardiology",
  "oncology": "Oncology",
  "pediatrics": "Pediatrics",
  "neurology": "Neurology",
  "orthopedics": "Orthopedics",
  "dermatology": "Dermatology",
  "psychiatry": "Psychiatry",
  "emergency-medicine": "Emergency Medicine",
  "internal-medicine": "Internal Medicine",
  "surgery": "Surgery",
  "radiology": "Radiology",
  "pathology": "Pathology",
  "anesthesiology": "Anesthesiology",
  "obstetrics-gynecology": "Obstetrics & Gynecology",
  "family-medicine": "Family Medicine",
  "general": "General"
}

export function HealthcareAgentSelector() {
  const { preferences } = useUserPreferences()

  const getRoleIcon = () => {
    switch (preferences.userRole) {
      case "medical_student":
        return BookOpenIcon
      case "doctor":
        return StethoscopeIcon
      default:
        return UserIcon
    }
  }

  const getRoleTitle = () => {
    switch (preferences.userRole) {
      case "medical_student":
        return "Medical Student Assistant"
      case "doctor":
        return "Healthcare Professional Assistant"
      default:
        return "General Health Assistant"
    }
  }

  const getRoleDescription = () => {
    switch (preferences.userRole) {
      case "medical_student":
        return "Tailored for medical education with focus on learning, clinical reasoning, and exam preparation."
      case "doctor":
        return "Specialized for healthcare professionals with evidence-based guidance and clinical decision support."
      default:
        return "General health and wellness support for everyday health questions and concerns."
    }
  }


  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-2 text-lg font-medium">AI Assistant Configuration</h4>
        <p className="text-muted-foreground mb-4 text-sm">
          Your AI assistant is configured based on your selected role and medical specialty.
        </p>
      </div>

      {/* Current Role Display */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {(() => {
              const RoleIcon = getRoleIcon()
              return <RoleIcon className="size-5 text-blue-600" />
            })()}
            {getRoleTitle()}
          </CardTitle>
          <CardDescription>
            {getRoleDescription()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h5 className="mb-2 text-sm font-medium">Current Settings:</h5>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">Role:</span>
                <span className="text-muted-foreground capitalize">
                  {preferences.userRole === "medical_student" ? "Medical Student" : preferences.userRole}
                </span>
              </div>
              
              {preferences.medicalSpecialty && preferences.medicalSpecialty !== "general" && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Specialty Focus:</span>
                  <span className="text-muted-foreground capitalize">
                    {specialtyLabels[preferences.medicalSpecialty]}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          {(preferences.userRole === "medical_student" || preferences.userRole === "doctor") && (
            <div>
              <h5 className="mb-2 text-sm font-medium">Available Features:</h5>
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-muted-foreground">
                  • Role-specific suggestions and prompts
                </span>
                <span className="text-xs text-muted-foreground">
                  • Tailored system prompts
                </span>
                {preferences.userRole === "doctor" && (
                  <span className="text-xs text-muted-foreground">
                    • Clinical decision support
                  </span>
                )}
                {preferences.userRole === "medical_student" && (
                  <span className="text-xs text-muted-foreground">
                    • Educational guidance
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 