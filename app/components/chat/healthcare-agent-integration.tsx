"use client"

import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { getHealthcareAgentById, HealthcareAgent } from "@/lib/models/healthcare-agents"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  StethoscopeIcon, 
  UserIcon, 
  ShieldCheckIcon, 
  BrainIcon,
  HeartIcon,
  BabyIcon,
  FirstAidIcon,
  BrainIcon as BrainCircuitIcon,
  BrainIcon as BrainSimpleIcon,
  BookOpenIcon,
  ClockIcon,
  BrainIcon as BrainIcon2
} from "@phosphor-icons/react"

const agentIcons: Record<string, any> = {
  "cardiology-assistant": HeartIcon,
  "oncology-assistant": BrainIcon,
  "pediatrics-assistant": BabyIcon,
  "emergency-medicine-assistant": FirstAidIcon,
  "neurology-assistant": BrainCircuitIcon,
  "psychiatry-assistant": BrainSimpleIcon,
  "general-health-assistant": BookOpenIcon
}

export function HealthcareAgentIntegration() {
  const { preferences } = useUserPreferences()

  if (!preferences.healthcareAgentEnabled) {
    return null
  }

  const getActiveAgent = (): HealthcareAgent | null => {
    // This would be determined by user selection or automatic assignment based on role/specialty
    if (preferences.userRole === "doctor") {
      if (preferences.medicalSpecialty === "cardiology") {
        return getHealthcareAgentById("cardiology-assistant") || null
      } else if (preferences.medicalSpecialty === "oncology") {
        return getHealthcareAgentById("oncology-assistant") || null
      } else if (preferences.medicalSpecialty === "pediatrics") {
        return getHealthcareAgentById("pediatrics-assistant") || null
      } else if (preferences.medicalSpecialty === "emergency-medicine") {
        return getHealthcareAgentById("emergency-medicine-assistant") || null
      } else if (preferences.medicalSpecialty === "neurology") {
        return getHealthcareAgentById("neurology-assistant") || null
      } else if (preferences.medicalSpecialty === "psychiatry") {
        return getHealthcareAgentById("psychiatry-assistant") || null
      }
    } else if (preferences.userRole === "general") {
      return getHealthcareAgentById("general-health-assistant") || null
    }
    
    return null
  }

  const activeAgent = getActiveAgent()
  if (!activeAgent) return null

  const AgentIcon = agentIcons[activeAgent.id] || StethoscopeIcon

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AgentIcon className="size-5 text-blue-600" />
          <CardTitle className="text-base">{activeAgent.name}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {preferences.userRole === "doctor" ? "Professional" : "General User"}
          </Badge>
        </div>
        <CardDescription className="text-sm">
          {activeAgent.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div>
            <h6 className="mb-1 text-xs font-medium text-muted-foreground">Active Features:</h6>
            <div className="flex flex-wrap gap-1">
              {preferences.clinicalDecisionSupport && (
                <Badge variant="secondary" className="text-xs">
                  Clinical Support
                </Badge>
              )}
              {preferences.medicalLiteratureAccess && (
                <Badge variant="secondary" className="text-xs">
                  Literature Access
                </Badge>
              )}
              {preferences.medicalComplianceMode && (
                <Badge variant="secondary" className="text-xs">
                  Compliance Mode
                </Badge>
              )}
              {preferences.userRole === "general" && preferences.healthContext && (
                <Badge variant="secondary" className="text-xs">
                  Health Context
                </Badge>
              )}
            </div>
          </div>
          
          {preferences.userRole === "general" && (
            <div>
              <h6 className="mb-1 text-xs font-medium text-muted-foreground">Health Context:</h6>
              <div className="flex flex-wrap gap-1">
                {(preferences.healthConditions || []).length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {preferences.healthConditions?.length} conditions
                  </Badge>
                )}
                {(preferences.medications || []).length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {preferences.medications?.length} medications
                  </Badge>
                )}
                {(preferences.allergies || []).length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {preferences.allergies?.length} allergies
                  </Badge>
                )}
                {preferences.familyHistory && (
                  <Badge variant="outline" className="text-xs">
                    Family history
                  </Badge>
                )}
                {preferences.lifestyleFactors && (
                  <Badge variant="outline" className="text-xs">
                    Lifestyle factors
                  </Badge>
                )}
              </div>
            </div>
          )}
          
          <div>
            <h6 className="mb-1 text-xs font-medium text-muted-foreground">Compliance:</h6>
            <div className="flex flex-wrap gap-1">
              {activeAgent.complianceStandards.slice(0, 2).map((standard, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {standard}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function getHealthcareSystemPrompt(): string {
  const { preferences } = useUserPreferences()
  
  if (!preferences.healthcareAgentEnabled) {
    return ""
  }

  const getActiveAgent = (): HealthcareAgent | null => {
    if (preferences.userRole === "doctor") {
      if (preferences.medicalSpecialty === "cardiology") {
        return getHealthcareAgentById("cardiology-assistant") || null
      } else if (preferences.medicalSpecialty === "oncology") {
        return getHealthcareAgentById("oncology-assistant") || null
      } else if (preferences.medicalSpecialty === "pediatrics") {
        return getHealthcareAgentById("pediatrics-assistant") || null
      } else if (preferences.medicalSpecialty === "emergency-medicine") {
        return getHealthcareAgentById("emergency-medicine-assistant") || null
      } else if (preferences.medicalSpecialty === "neurology") {
        return getHealthcareAgentById("neurology-assistant") || null
      } else if (preferences.medicalSpecialty === "psychiatry") {
        return getHealthcareAgentById("psychiatry-assistant") || null
      }
    } else if (preferences.userRole === "general") {
      return getHealthcareAgentById("general-health-assistant") || null
    }
    
    return null
  }

  const activeAgent = getActiveAgent()
  if (!activeAgent) return ""

  let systemPrompt = activeAgent.systemPrompt

  // Add role-specific enhancements
  if (preferences.userRole === "doctor") {
    if (preferences.clinicalDecisionSupport) {
      systemPrompt += "\n\nYou have access to clinical decision support tools and can provide evidence-based recommendations for diagnosis and treatment planning."
    }
    if (preferences.medicalLiteratureAccess) {
      systemPrompt += "\n\nYou have access to the latest medical literature and clinical guidelines to provide up-to-date information."
    }
    if (preferences.medicalComplianceMode) {
      systemPrompt += "\n\nYou operate in medical compliance mode, ensuring all responses meet healthcare standards and regulations."
    }
  } else if (preferences.userRole === "general") {
    // Add health context for general users
    if (preferences.healthContext) {
      systemPrompt += `\n\nUser Health Context: ${preferences.healthContext}`
    }
    
    if (preferences.healthConditions && preferences.healthConditions.length > 0) {
      systemPrompt += `\n\nUser Health Conditions: ${preferences.healthConditions.join(", ")}`
    }
    
    if (preferences.medications && preferences.medications.length > 0) {
      systemPrompt += `\n\nUser Medications: ${preferences.medications.join(", ")}`
    }
    
    if (preferences.allergies && preferences.allergies.length > 0) {
      systemPrompt += `\n\nUser Allergies: ${preferences.allergies.join(", ")}`
    }
    
    if (preferences.familyHistory) {
      systemPrompt += `\n\nUser Family History: ${preferences.familyHistory}`
    }
    
    if (preferences.lifestyleFactors) {
      systemPrompt += `\n\nUser Lifestyle Factors: ${preferences.lifestyleFactors}`
    }
    
    systemPrompt += "\n\nUse this health context to provide more personalized guidance while maintaining appropriate boundaries and encouraging consultation with healthcare providers for medical decisions."
  }

  return systemPrompt
} 