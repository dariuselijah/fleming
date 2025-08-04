"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { getHealthcareAgentsByRole, getHealthcareAgentById, HealthcareAgent } from "@/lib/models/healthcare-agents"
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
  "cardiology-assistant": HeartIcon,
  "oncology-assistant": BrainIcon,
  "pediatrics-assistant": BabyIcon,
  "emergency-medicine-assistant": FirstAidIcon,
  "neurology-assistant": BrainCircuitIcon,
  "psychiatry-assistant": BrainSimpleIcon,
  "patient-education-assistant": BookOpenIcon,
  "chronic-disease-assistant": ClockIcon,
  "mental-health-support": BrainIcon2
}

export function HealthcareAgentSelector() {
  const { preferences, updatePreferences } = useUserPreferences()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  const availableAgents = getHealthcareAgentsByRole(preferences.userRole)

  const handleAgentSelect = async (agentId: string) => {
    setIsUpdating(true)
    try {
      // Update user preferences with selected agent
      await updatePreferences({ 
        healthcareAgentEnabled: true,
        // Add agent-specific settings based on the selected agent
      })
      setSelectedAgent(agentId)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDisableAgent = async () => {
    setIsUpdating(true)
    try {
      await updatePreferences({ 
        healthcareAgentEnabled: false,
        clinicalDecisionSupport: false,
        medicalLiteratureAccess: false,
        medicalComplianceMode: false,
        patientEducationMode: false
      })
      setSelectedAgent(null)
    } finally {
      setIsUpdating(false)
    }
  }

  const currentAgent = selectedAgent ? getHealthcareAgentById(selectedAgent) : null
  const CurrentAgentIcon = currentAgent ? agentIcons[currentAgent.id] || StethoscopeIcon : StethoscopeIcon

  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-2 text-lg font-medium">Healthcare AI Assistant</h4>
        <p className="text-muted-foreground mb-4 text-sm">
          Select a specialized AI assistant tailored to your healthcare needs.
        </p>
      </div>

      {/* Current Agent Display */}
      {preferences.healthcareAgentEnabled && currentAgent && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CurrentAgentIcon className="size-5 text-blue-600" />
              {currentAgent.name}
            </CardTitle>
            <CardDescription>
              {currentAgent.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h5 className="mb-2 text-sm font-medium">Capabilities:</h5>
              <div className="flex flex-wrap gap-1">
                {currentAgent.capabilities.map((capability, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {capability}
                  </Badge>
                ))}
              </div>
            </div>
            
            <div>
              <h5 className="mb-2 text-sm font-medium">Compliance Standards:</h5>
              <div className="flex flex-wrap gap-1">
                {currentAgent.complianceStandards.map((standard, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {standard}
                  </Badge>
                ))}
              </div>
            </div>

            <Button 
              variant="outline" 
              onClick={handleDisableAgent}
              disabled={isUpdating}
              className="w-full"
            >
              Disable Healthcare Assistant
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Available Agents */}
      {(!preferences.healthcareAgentEnabled || !currentAgent) && (
        <div className="space-y-4">
          <h5 className="text-sm font-medium">Available Assistants for {preferences.userRole === "doctor" ? "Healthcare Professionals" : "Patients"}:</h5>
          
          <div className="grid gap-4 md:grid-cols-2">
            {availableAgents.map((agent) => {
              const AgentIcon = agentIcons[agent.id] || StethoscopeIcon
              return (
                <Card 
                  key={agent.id} 
                  className="cursor-pointer transition-all hover:border-blue-300 hover:shadow-md"
                  onClick={() => handleAgentSelect(agent.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <AgentIcon className="size-5 text-blue-600" />
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                    </div>
                    <CardDescription className="text-sm">
                      {agent.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div>
                        <h6 className="mb-1 text-xs font-medium text-muted-foreground">Key Capabilities:</h6>
                        <div className="flex flex-wrap gap-1">
                          {agent.capabilities.slice(0, 3).map((capability, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {capability}
                            </Badge>
                          ))}
                          {agent.capabilities.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{agent.capabilities.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <h6 className="mb-1 text-xs font-medium text-muted-foreground">Compliance:</h6>
                        <div className="flex flex-wrap gap-1">
                          {agent.complianceStandards.slice(0, 2).map((standard, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {standard}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <Button 
                        variant="default" 
                        size="sm" 
                        className="w-full"
                        disabled={isUpdating}
                      >
                        Select Assistant
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* No Agents Available */}
      {availableAgents.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <StethoscopeIcon className="mb-2 size-8 text-muted-foreground" />
            <p className="text-center text-sm text-muted-foreground">
              No specialized assistants available for your current role.
              <br />
              Try changing your role in the Healthcare Settings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 