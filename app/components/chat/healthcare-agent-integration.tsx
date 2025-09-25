"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import {
  HealthcareAgent,
  getHealthcareAgentById
} from "@/lib/models/healthcare-agents"

export function HealthcareAgentIntegration() {
  const { preferences } = useUserPreferences()
  
  if (preferences.userRole !== "doctor" && preferences.userRole !== "medical_student") {
    return null
  }

  const getActiveAgent = (): HealthcareAgent | null => {
    // For healthcare professionals and medical students, always use the orchestrator
    return getHealthcareAgentById("healthcare_orchestrator") || null
  }

  const activeAgent = getActiveAgent()
  if (!activeAgent) return null

  const getRoleTitle = () => {
    switch (preferences.userRole) {
      case "medical_student":
        return "Medical Student AI Assistant"
      case "doctor":
        return "Healthcare AI Orchestrator"
      default:
        return "Healthcare AI Assistant"
    }
  }

  // Commented out unused function
  // const getRoleDescription = () => {
  //   switch (preferences.userRole) {
  //     case "medical_student":
  //       return "Tailored for medical education with focus on learning, clinical reasoning, and exam preparation."
  //     case "doctor":
  //       return "Sophisticated medical intelligence system that coordinates multiple specialized AI agents."
  //     default:
  //       return "AI assistant for healthcare professionals."
  //   }
  // }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            🏥
          </div>
          {getRoleTitle()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h6 className="mb-1 text-xs font-medium text-muted-foreground">Capabilities:</h6>
          <div className="flex flex-wrap gap-1">
            {activeAgent.capabilities.slice(0, 3).map((capability, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {capability.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        </div>
        
        <div>
          <h6 className="mb-1 text-xs font-medium text-muted-foreground">Available Specialized Agents:</h6>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-xs">
              Clinical Diagnosis
            </Badge>
            <Badge variant="outline" className="text-xs">
              Evidence-Based Medicine
            </Badge>
            <Badge variant="outline" className="text-xs">
              Drug Interactions
            </Badge>
            <Badge variant="outline" className="text-xs">
              Imaging Interpretation
            </Badge>
            <Badge variant="outline" className="text-xs">
              Laboratory Analysis
            </Badge>
            <Badge variant="outline" className="text-xs">
              Treatment Planning
            </Badge>
            <Badge variant="outline" className="text-xs">
              Risk Assessment
            </Badge>
            <Badge variant="outline" className="text-xs">
              Specialty Consultant
            </Badge>
          </div>
        </div>

        {preferences.medicalSpecialty && (
          <div>
            <h6 className="mb-1 text-xs font-medium text-muted-foreground">Specialty:</h6>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-xs">
                {preferences.medicalSpecialty.replace(/_/g, " ")}
              </Badge>
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
      </CardContent>
    </Card>
  )
}

// Utility function to generate healthcare system prompt based on user preferences
// This is not a React component and should receive preferences as a parameter
export function getHealthcareSystemPrompt(preferences: {
  userRole?: string;
  medicalSpecialty?: string;
  clinicalDecisionSupport?: boolean;
  medicalLiteratureAccess?: boolean;
  medicalComplianceMode?: boolean;
}): string {
  if (preferences.userRole !== "doctor" && preferences.userRole !== "medical_student") {
    return ""
  }

  // Get the orchestrator agent
  const orchestrator = getHealthcareAgentById("healthcare_orchestrator")
  if (!orchestrator) return ""

  let systemPrompt = orchestrator.systemPrompt

  // Add specialty-specific context
  if (preferences.medicalSpecialty) {
    systemPrompt += `\n\nSPECIALTY CONTEXT: You are assisting a ${preferences.medicalSpecialty.replace(/_/g, " ")} specialist.`

    // Add specialty-specific agents based on the specialty suggestions
    const specialtyAgents = getSpecialtyAgents(preferences.medicalSpecialty)
    if (specialtyAgents.length > 0) {
      systemPrompt += `\n\nSPECIALTY-SPECIFIC AGENTS: ${specialtyAgents.map(agent => agent.name).join(", ")}`
    }
  }

  // Add role-specific context
  if (preferences.userRole === "medical_student") {
    systemPrompt += "\n\nROLE CONTEXT: You are assisting a medical student. Focus on educational explanations, clinical reasoning development, and exam preparation support."
  }

  // Add clinical decision support tools
  if (preferences.clinicalDecisionSupport) {
    systemPrompt += "\n\nCLINICAL DECISION SUPPORT: Enabled with access to evidence-based algorithms and clinical guidelines."
  }

  // Add medical literature access
  if (preferences.medicalLiteratureAccess) {
    systemPrompt += "\n\nMEDICAL LITERATURE ACCESS: Enabled with access to latest research, guidelines, and clinical evidence."
  }

  // Add medical compliance mode
  if (preferences.medicalComplianceMode) {
    systemPrompt += "\n\nMEDICAL COMPLIANCE MODE: Operating in strict medical compliance mode, ensuring all responses meet healthcare standards and regulations."
  }

  return systemPrompt
}

// Function to get specialty-specific agents based on the specialty suggestions
function getSpecialtyAgents(specialty: string): HealthcareAgent[] {
  const specialtyAgentMap: Record<string, string[]> = {
    cardiology: ["clinical_diagnosis_agent", "evidence_based_medicine_agent", "risk_assessment_agent"],
    pediatrics: ["clinical_diagnosis_agent", "treatment_planning_agent", "specialty_consultant_agent"],
    oncology: ["clinical_diagnosis_agent", "treatment_planning_agent", "evidence_based_medicine_agent"],
    psychiatry: ["clinical_diagnosis_agent", "drug_interaction_agent", "specialty_consultant_agent"],
    emergency_medicine: ["clinical_diagnosis_agent", "risk_assessment_agent", "treatment_planning_agent"],
    internal_medicine: ["clinical_diagnosis_agent", "evidence_based_medicine_agent", "treatment_planning_agent"]
  }
  
  const agentIds = specialtyAgentMap[specialty] || []
  return agentIds.map(id => getHealthcareAgentById(id)).filter(Boolean) as HealthcareAgent[]
} 