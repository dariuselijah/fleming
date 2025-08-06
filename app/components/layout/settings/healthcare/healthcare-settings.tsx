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
import { useState, useEffect } from "react"
import { HealthcareAgentSelector } from "./healthcare-agent-selector"
import { Badge } from "@/components/ui/badge"

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
    } catch (error) {
      console.error("Error updating user role:", error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleSpecialtyChange = async (specialty: MedicalSpecialty) => {
    setIsUpdating(true)
    try {
      await updatePreferences({ medicalSpecialty: specialty })
    } catch (error) {
      console.error("Error updating medical specialty:", error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleToggle = async (key: keyof typeof preferences, value: boolean) => {
    setIsUpdating(true)
    try {
      await updatePreferences({ [key]: value })
    } catch (error) {
      console.error("Error updating", key, ":", error)
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
                <SelectItem value="medical-student">
                  <div className="flex items-center gap-2">
                    <BookOpenIcon className="size-4" />
                    Medical Student
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
            <ShieldCheckIcon className="size-5" />
            Healthcare Agent Configuration
          </CardTitle>
          <CardDescription>
            Configure advanced features for healthcare professionals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {preferences.userRole === "doctor" ? (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Clinical Decision Support</Label>
                  <p className="text-muted-foreground text-sm">
                    Enable evidence-based clinical decision support tools.
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
                    Access to latest medical literature and guidelines.
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
                    Strict medical compliance and safety protocols.
                  </p>
                </div>
                <Switch
                  checked={preferences.medicalComplianceMode}
                  onCheckedChange={(checked) => handleToggle("medicalComplianceMode", checked)}
                  disabled={isUpdating}
                />
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <UserIcon className="mx-auto mb-2 size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Healthcare agent configuration is only available for healthcare professionals.
              </p>
            </div>
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
                  <span className="text-sm text-muted-foreground capitalize">
                    {preferences.medicalSpecialty.replace(/-/g, " ")}
                  </span>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Features Enabled:</span>
                <div className="flex gap-1">
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
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
