"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { 
  BookOpenIcon,
  PlusIcon,
  XIcon
} from "@phosphor-icons/react"
import { useState } from "react"

export function HealthContext() {
  const { preferences, updatePreferences } = useUserPreferences()
  const [isUpdating, setIsUpdating] = useState(false)
  const [newHealthCondition, setNewHealthCondition] = useState("")
  const [newMedication, setNewMedication] = useState("")
  const [newAllergy, setNewAllergy] = useState("")

  const handleTextChange = async (key: keyof typeof preferences, value: string) => {
    setIsUpdating(true)
    try {
      await updatePreferences({ [key]: value })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleArrayAdd = async (key: keyof typeof preferences, value: string) => {
    if (!value.trim()) return
    
    const currentArray = preferences[key] as string[] || []
    const newArray = [...currentArray, value.trim()]
    
    setIsUpdating(true)
    try {
      await updatePreferences({ [key]: newArray })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleArrayRemove = async (key: keyof typeof preferences, index: number) => {
    const currentArray = preferences[key] as string[] || []
    const newArray = currentArray.filter((_, i) => i !== index)
    
    setIsUpdating(true)
    try {
      await updatePreferences({ [key]: newArray })
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpenIcon className="size-5" />
          Health Context
        </CardTitle>
        <CardDescription>
          Provide information about your health to get more personalized guidance from the AI assistant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="health-context">General Health Context</Label>
          <Textarea
            placeholder="Describe your general health, concerns, or what you'd like to focus on..."
            value={preferences.healthContext || ""}
            onChange={(e) => handleTextChange("healthContext", e.target.value)}
            disabled={isUpdating}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>Health Conditions</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Add a health condition..."
              value={newHealthCondition}
              onChange={(e) => setNewHealthCondition(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleArrayAdd("healthConditions", newHealthCondition)
                  setNewHealthCondition("")
                }
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                handleArrayAdd("healthConditions", newHealthCondition)
                setNewHealthCondition("")
              }}
              disabled={!newHealthCondition.trim()}
            >
              <PlusIcon className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {(preferences.healthConditions || []).map((condition, index) => (
              <div key={index} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                {condition}
                <button
                  onClick={() => handleArrayRemove("healthConditions", index)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Current Medications</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Add a medication..."
              value={newMedication}
              onChange={(e) => setNewMedication(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleArrayAdd("medications", newMedication)
                  setNewMedication("")
                }
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                handleArrayAdd("medications", newMedication)
                setNewMedication("")
              }}
              disabled={!newMedication.trim()}
            >
              <PlusIcon className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {(preferences.medications || []).map((medication, index) => (
              <div key={index} className="flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                {medication}
                <button
                  onClick={() => handleArrayRemove("medications", index)}
                  className="text-green-600 hover:text-green-800"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Allergies</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Add an allergy..."
              value={newAllergy}
              onChange={(e) => setNewAllergy(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleArrayAdd("allergies", newAllergy)
                  setNewAllergy("")
                }
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                handleArrayAdd("allergies", newAllergy)
                setNewAllergy("")
              }}
              disabled={!newAllergy.trim()}
            >
              <PlusIcon className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {(preferences.allergies || []).map((allergy, index) => (
              <div key={index} className="flex items-center gap-1 bg-red-100 text-red-800 px-2 py-1 rounded text-sm">
                {allergy}
                <button
                  onClick={() => handleArrayRemove("allergies", index)}
                  className="text-red-600 hover:text-red-800"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="family-history">Family History</Label>
          <Textarea
            placeholder="Describe any relevant family medical history..."
            value={preferences.familyHistory || ""}
            onChange={(e) => handleTextChange("familyHistory", e.target.value)}
            disabled={isUpdating}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lifestyle-factors">Lifestyle Factors</Label>
          <Textarea
            placeholder="Describe your lifestyle factors (diet, exercise, sleep, stress, etc.)..."
            value={preferences.lifestyleFactors || ""}
            onChange={(e) => handleTextChange("lifestyleFactors", e.target.value)}
            disabled={isUpdating}
            rows={2}
          />
        </div>
      </CardContent>
    </Card>
  )
} 