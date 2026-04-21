"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { usePracticeProfileForm } from "@/lib/practice/use-practice-profile-form"
import { Buildings, FloppyDisk, Spinner } from "@phosphor-icons/react"

export function PracticeProfileCard() {
  const {
    practiceId,
    unlocked,
    practiceName,
    setPracticeName,
    providerName,
    setProviderName,
    bhf,
    setBhf,
    timezone,
    setTimezone,
    hl7Endpoint,
    setHl7Endpoint,
    physicalAddress,
    setPhysicalAddress,
    loading,
    saving,
    loadError,
    save,
  } = usePracticeProfileForm()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Buildings className="size-5" />
          Practice profile
        </CardTitle>
        <CardDescription>
          Legal name, BHF, and integration endpoints used on claims and messages. Sensitive fields are encrypted with
          your practice key.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!practiceId || !unlocked ? (
          <p className="text-muted-foreground text-sm">Unlock the clinical workspace to edit practice identifiers.</p>
        ) : loadError ? (
          <p className="text-destructive text-sm">{loadError}</p>
        ) : loading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner className="size-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pp-address">Practice address</Label>
                <Textarea
                  id="pp-address"
                  value={physicalAddress}
                  onChange={(e) => setPhysicalAddress(e.target.value)}
                  placeholder="Street, suburb, city, postal code"
                  rows={3}
                  className="min-h-[80px] resize-y"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pp-name">Legal / trading name</Label>
                <Input
                  id="pp-name"
                  value={practiceName}
                  onChange={(e) => setPracticeName(e.target.value)}
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pp-provider">Provider display (claims)</Label>
                <Input
                  id="pp-provider"
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pp-bhf">Practice No. / BHF</Label>
                <Input id="pp-bhf" value={bhf} onChange={(e) => setBhf(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pp-tz">Timezone</Label>
                <Input id="pp-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pp-hl7">HL7 inbound endpoint</Label>
                <Input
                  id="pp-hl7"
                  value={hl7Endpoint}
                  onChange={(e) => setHl7Endpoint(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>
            <Button type="button" size="sm" disabled={!unlocked || !practiceId || saving} onClick={() => void save()}>
              {saving ? <Spinner className="mr-2 size-4 animate-spin" /> : <FloppyDisk className="mr-2 size-4" />}
              Save practice details
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
