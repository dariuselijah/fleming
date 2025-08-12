"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function TestArtifactDetection() {
  const [userPrompt, setUserPrompt] = useState("write an essay about climate change")
  const [aiResponse, setAiResponse] = useState("Climate change is one of the most pressing issues facing humanity today. The Earth's climate has been changing throughout history, but the current rate of change is unprecedented. Human activities, particularly the burning of fossil fuels, have led to a significant increase in greenhouse gas concentrations in the atmosphere. This has resulted in global warming, which is causing a cascade of environmental effects including rising sea levels, more frequent and severe weather events, and shifts in ecosystems. The scientific consensus is clear: we must take immediate action to reduce our carbon footprint and transition to renewable energy sources. This requires both individual and collective action, from changing our daily habits to implementing large-scale policy changes. The time to act is now, as the consequences of inaction will be severe and irreversible.")
  const [detectionResult, setDetectionResult] = useState<any>(null)

  const testDetection = async () => {
    try {
      const response = await fetch('/api/test-artifact-detection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userPrompt,
          aiResponse
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        setDetectionResult(result)
      }
    } catch (error) {
      console.error('Error testing detection:', error)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Artifact Detection Test</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Input</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="userPrompt">User Prompt</Label>
              <Input
                id="userPrompt"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="Enter user prompt..."
              />
            </div>
            
            <div>
              <Label htmlFor="aiResponse">AI Response</Label>
              <textarea
                id="aiResponse"
                value={aiResponse}
                onChange={(e) => setAiResponse(e.target.value)}
                placeholder="Enter AI response..."
                className="w-full h-32 p-3 border rounded-md resize-none"
              />
            </div>
            
            <Button onClick={testDetection} className="w-full">
              Test Detection
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detection Result</CardTitle>
          </CardHeader>
          <CardContent>
            {detectionResult ? (
              <pre className="bg-muted p-4 rounded-md overflow-auto text-sm">
                {JSON.stringify(detectionResult, null, 2)}
              </pre>
            ) : (
              <p className="text-muted-foreground">
                Click "Test Detection" to see the result
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
