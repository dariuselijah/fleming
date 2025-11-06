"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Clock, CheckCircle } from "@phosphor-icons/react"
import { useEffect, useState } from "react"

type RateLimitPaywallProps = {
  open: boolean
  setOpen: (open: boolean) => void
  waitTimeSeconds: number | null
  limitType?: "hourly" | "daily"
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

export function RateLimitPaywall({
  open,
  setOpen,
  waitTimeSeconds,
  limitType = "hourly",
}: RateLimitPaywallProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(
    waitTimeSeconds || 0
  )

  useEffect(() => {
    if (!open || !waitTimeSeconds) return

    setTimeRemaining(waitTimeSeconds)

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [open, waitTimeSeconds])

  const isHourly = limitType === "hourly"
  const title = isHourly
    ? "Rate Limit Reached"
    : "Daily Limit Reached"
  const description = isHourly
    ? "You've reached your hourly message limit. Please wait a bit before sending another message."
    : "You've reached your daily message limit. Please come back tomorrow."

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <DialogTitle className="text-xl">{title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-base">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="my-6">
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border bg-muted/50 p-6">
            {timeRemaining > 0 ? (
              <>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    Please wait
                  </p>
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-4xl font-bold tracking-tight">
                      {formatTime(timeRemaining)}
                    </span>
                  </div>
                </div>
                <div className="w-full max-w-xs">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-1000 ease-linear"
                      style={{
                        width: `${Math.max(0, Math.min(100, (timeRemaining / (waitTimeSeconds || 3600)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="mb-2 flex justify-center">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
                <p className="text-lg font-medium">You can send messages now!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The rate limit has been reset.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-center">
          <Button
            variant="secondary"
            className="w-full text-base"
            size="lg"
            onClick={() => setOpen(false)}
            disabled={timeRemaining > 0}
          >
            {timeRemaining > 0 ? "Waiting..." : "Got it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

