"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { getHealthcareAgentById, HealthcareAgent } from "@/lib/models/healthcare-agents"
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
import { useState } from "react"

const agentIcons: Record<string, any> = {
  "healthcare_orchestrator": StethoscopeIcon,
  "clinical_diagnosis_agent": BrainIcon,
  "evidence_based_medicine_agent": BookOpenIcon,
  "drug_interaction_agent": ShieldCheckIcon,
  "imaging_interpretation_agent": BrainCircuitIcon,
  "laboratory_analysis_agent": BrainSimpleIcon,
  "treatment_planning_agent": ClockIcon,
  "risk_assessment_agent": BrainIcon2,
  "specialty_consultant_agent": HeartIcon
}

export function HealthcareAgentSelector() {
  const { preferences, updatePreferences } = useUserPreferences()
  const [isUpdating, setIsUpdating] = useState(false)

  // Debug logging
  console.log("HealthcareAgentSelector - Current preferences:", {
    userRole: preferences.userRole,
    healthcareAgentEnabled: preferences.healthcareAgentEnabled,
    medicalSpecialty: preferences.medicalSpecialty
  })

  const handleEnableHealthcareAgent = async () => {
    setIsUpdating(true)
    try {
      console.log("Enabling healthcare agent...")
      await updatePreferences({ 
        healthcareAgentEnabled: true,
        clinicalDecisionSupport: true,
        medicalLiteratureAccess: true,
        medicalComplianceMode: true
      })
      console.log("Healthcare agent enabled successfully")
    } catch (error) {
      console.error("Error enabling healthcare agent:", error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDisableAgent = async () => {
    setIsUpdating(true)
    try {
      console.log("Disabling healthcare agent...")
      await updatePreferences({ 
        healthcareAgentEnabled: false,
        clinicalDecisionSupport: false,
        medicalLiteratureAccess: false,
        medicalComplianceMode: false
      })
      console.log("Healthcare agent disabled successfully")
    } catch (error) {
      console.error("Error disabling healthcare agent:", error)
    } finally {
      setIsUpdating(false)
    }
  }

  const orchestratorAgent = getHealthcareAgentById("healthcare_orchestrator")
  const OrchestratorIcon = orchestratorAgent ? agentIcons[orchestratorAgent.id] || StethoscopeIcon : StethoscopeIcon

  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-2 text-lg font-medium">Healthcare AI Orchestrator</h4>
        <p className="text-muted-foreground mb-4 text-sm">
          Enable the advanced multi-agent healthcare system for comprehensive medical assistance.
        </p>
      </div>

      {/* Current Agent Display */}
      {preferences.healthcareAgentEnabled && orchestratorAgent && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <OrchestratorIcon className="size-5 text-blue-600" />
              Healthcare AI Orchestrator
            </CardTitle>
            <CardDescription>
              Sophisticated medical intelligence system that coordinates multiple specialized AI agents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h5 className="mb-2 text-sm font-medium">Available Specialized Agents:</h5>
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary" className="text-xs">
                  Clinical Diagnosis
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Evidence-Based Medicine
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Drug Interactions
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Imaging Interpretation
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Laboratory Analysis
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Treatment Planning
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Risk Assessment
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Specialty Consultant
                </Badge>
              </div>
            </div>
            
            <div>
              <h5 className="mb-2 text-sm font-medium">Compliance Standards:</h5>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-xs">
                  HIPAA
                </Badge>
                <Badge variant="outline" className="text-xs">
                  FDA
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Medical Ethics
                </Badge>
              </div>
            </div>

            <Button 
              variant="outline" 
              onClick={handleDisableAgent}
              disabled={isUpdating}
              className="w-full"
            >
              Disable Healthcare Orchestrator
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Enable Healthcare Agent */}
      {!preferences.healthcareAgentEnabled && preferences.userRole === "doctor" && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StethoscopeIcon className="size-5" />
              Enable Healthcare AI Orchestrator
            </CardTitle>
            <CardDescription>
              Activate the advanced multi-agent healthcare system for comprehensive medical assistance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h5 className="mb-2 text-sm font-medium">System Features:</h5>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>• Intelligent query analysis and agent routing</div>
                <div>• Evidence-based medical knowledge integration</div>
                <div>• Multi-agent coordination and response synthesis</div>
                <div>• Specialty-specific expertise and protocols</div>
                <div>• Built-in safety validation and compliance</div>
              </div>
            </div>

            <Button 
              variant="default" 
              onClick={handleEnableHealthcareAgent}
              disabled={isUpdating}
              className="w-full"
            >
              Enable Healthcare Orchestrator
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Not Available for General Users */}
      {preferences.userRole === "general" && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <UserIcon className="mb-2 size-8 text-muted-foreground" />
            <p className="text-center text-sm text-muted-foreground">
              The Healthcare AI Orchestrator is only available for healthcare professionals.
              <br />
              Change your role to "Healthcare Professional" to access this feature.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 