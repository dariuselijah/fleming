"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { MedicalSpecialty, UserRole } from "@/lib/user-preference-store/utils"
import { 
  RobotIcon, 
  UserIcon, 
  ShieldCheckIcon, 
  BookOpenIcon, 
  BrainIcon, 
  MicroscopeIcon,
  HeartIcon,
  BabyIcon,
  BrainIcon as BrainCircuitIcon,
  BoneIcon,
  EyeIcon,
  BrainIcon as BrainSimpleIcon,
  FirstAidIcon,
  UserGearIcon,
  WrenchIcon,
  TrayIcon,
  TestTubeIcon,
  SyringeIcon,
  BabyCarriageIcon,
  UserListIcon
} from "@phosphor-icons/react"
import { useState } from "react"
import { HealthcareAgentSelector } from "./healthcare-agent-selector"

const specialtyIcons: Record<MedicalSpecialty, any> = {
  "cardiology": HeartIcon,
  "oncology": MicroscopeIcon,
  "pediatrics": BabyIcon,
  "neurology": BrainCircuitIcon,
  "orthopedics": BoneIcon,
  "dermatology": EyeIcon,
  "psychiatry": BrainSimpleIcon,
  "emergency-medicine": FirstAidIcon,
  "internal-medicine": UserGearIcon,
  "surgery": WrenchIcon,
  "radiology": TrayIcon,
  "pathology": TestTubeIcon,
  "anesthesiology": SyringeIcon,
  "obstetrics-gynecology": BabyCarriageIcon,
  "family-medicine": UserListIcon,
  "general": UserIcon
}

const specialtyLabels: Record<MedicalSpecialty, string> = {
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

export function HealthcareSettings() {
  const { preferences, updatePreferences } = useUserPreferences()
  const [isUpdating, setIsUpdating] = useState(false)

  const handleRoleChange = async (role: UserRole) => {
    setIsUpdating(true)
    try {
      await updatePreferences({ userRole: role })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleSpecialtyChange = async (specialty: MedicalSpecialty) => {
    setIsUpdating(true)
    try {
      await updatePreferences({ medicalSpecialty: specialty })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleToggle = async (key: keyof typeof preferences, value: boolean) => {
    setIsUpdating(true)
    try {
      await updatePreferences({ [key]: value })
    } finally {
      setIsUpdating(false)
    }
  }

  const SpecialtyIcon = preferences.medicalSpecialty ? specialtyIcons[preferences.medicalSpecialty] : UserIcon

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-lg font-medium">AI Agents</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          Configure specialized AI agents for your specific role and needs.
        </p>
      </div>

      {/* Role Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="size-5" />
            User Role
          </CardTitle>
          <CardDescription>
            Select your role to customize the AI assistant for your specific needs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-role">Primary Role</Label>
            <Select
              value={preferences.userRole}
              onValueChange={handleRoleChange}
              disabled={isUpdating}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select your role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">
                  <div className="flex items-center gap-2">
                    <UserIcon className="size-4" />
                    General User
                  </div>
                </SelectItem>
                <SelectItem value="doctor">
                  <div className="flex items-center gap-2">
                    <RobotIcon className="size-4" />
                    Healthcare Professional
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {preferences.userRole === "doctor" && (
            <div className="space-y-2">
              <Label htmlFor="medical-specialty">Medical Specialty</Label>
              <Select
                value={preferences.medicalSpecialty || "general"}
                onValueChange={handleSpecialtyChange}
                disabled={isUpdating}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select your specialty" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(specialtyLabels).map(([key, label]) => {
                    const Icon = specialtyIcons[key as MedicalSpecialty]
                    return (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <Icon className="size-4" />
                          {label}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Healthcare Agent Selection */}
      <HealthcareAgentSelector />

      {/* Healthcare Agent Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RobotIcon className="size-5" />
            AI Agent Configuration
          </CardTitle>
          <CardDescription>
            Enable and configure specialized AI features for your role.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable AI Agent</Label>
              <p className="text-muted-foreground text-sm">
                Activate specialized AI features
              </p>
            </div>
            <Switch
              checked={preferences.healthcareAgentEnabled}
              onCheckedChange={(checked) => handleToggle("healthcareAgentEnabled", checked)}
              disabled={isUpdating}
            />
          </div>

          {preferences.userRole === "doctor" && preferences.healthcareAgentEnabled && (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Clinical Decision Support</Label>
                  <p className="text-muted-foreground text-sm">
                    AI assistance for diagnosis and treatment planning
                  </p>
                </div>
                <Switch
                  checked={preferences.clinicalDecisionSupport}
                  onCheckedChange={(checked) => handleToggle("clinicalDecisionSupport", checked)}
                  disabled={isUpdating}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Medical Literature Access</Label>
                  <p className="text-muted-foreground text-sm">
                    Access to latest medical research and guidelines
                  </p>
                </div>
                <Switch
                  checked={preferences.medicalLiteratureAccess}
                  onCheckedChange={(checked) => handleToggle("medicalLiteratureAccess", checked)}
                  disabled={isUpdating}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Medical Compliance Mode</Label>
                  <p className="text-muted-foreground text-sm">
                    Ensure responses meet medical standards and regulations
                  </p>
                </div>
                <Switch
                  checked={preferences.medicalComplianceMode}
                  onCheckedChange={(checked) => handleToggle("medicalComplianceMode", checked)}
                  disabled={isUpdating}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Current Configuration Summary */}
      {preferences.healthcareAgentEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheckIcon className="size-5" />
              Current Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Role:</span>
                <span className="text-sm text-muted-foreground capitalize">
                  {preferences.userRole}
                </span>
              </div>
              
              {preferences.userRole === "doctor" && preferences.medicalSpecialty && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Specialty:</span>
                  <div className="flex items-center gap-1">
                    <SpecialtyIcon className="size-4" />
                    <span className="text-sm text-muted-foreground">
                      {specialtyLabels[preferences.medicalSpecialty]}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Active Features:</span>
                <div className="flex flex-wrap gap-1">
                  {preferences.clinicalDecisionSupport && (
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                      Clinical Support
                    </span>
                  )}
                  {preferences.medicalLiteratureAccess && (
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                      Literature Access
                    </span>
                  )}
                  {preferences.medicalComplianceMode && (
                    <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
                      Compliance Mode
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 