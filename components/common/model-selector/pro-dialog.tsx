"use client"

import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { APP_NAME } from "@/lib/config"
import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/lib/user-store/provider"
import { useMutation } from "@tanstack/react-query"
import Image from "next/image"

type ProModelDialogProps = {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  currentModel: string
}

export function ProModelDialog({
  isOpen,
  setIsOpen,
  currentModel,
}: ProModelDialogProps) {
  const { user } = useUser()
  const isMobile = useBreakpoint(768)
  const mutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Missing user")

      const supabase = await createClient()
      if (!supabase) throw new Error("Missing supabase")
      const { error } = await supabase.from("feedback").insert({
        message: `I want access to ${currentModel}`,
        user_id: user.id,
      })

      if (error) throw new Error(error.message)
    },
  })

  const renderContent = () => (
    <div className="flex max-h-[70vh] flex-col" key={currentModel}>
      <div className="relative overflow-hidden">
        <Image
          src="/banner_ocean.jpg"
          alt={`${APP_NAME} model availability`}
          width={400}
          height={128}
          className="h-32 w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
        <Badge className="absolute top-3 left-3 border border-white/30 bg-black/30 text-white backdrop-blur">
          Locked for now
        </Badge>
      </div>

      <div className="px-6 pt-4 text-center text-xl leading-tight font-semibold tracking-tight">
        These models are locked for now
      </div>

      <div className="flex-grow overflow-y-auto">
        <div className="px-6 py-4">
          <p className="text-muted-foreground text-center leading-relaxed">
            <span className="text-foreground font-medium">{currentModel}</span> is
            temporarily unavailable in your workspace.
          </p>
          <p className="text-muted-foreground mt-2 text-center leading-relaxed">
            They should be available soon.
          </p>
          {mutation.isSuccess ? (
            <div className="mt-5 flex justify-center gap-3">
              <Badge className="bg-green-600 text-white">
                Thanks! We&apos;ll keep you updated
              </Badge>
            </div>
          ) : (
            <div className="mt-5 flex justify-center gap-3">
              <Button
                className="w-full rounded-full"
                onClick={() => mutation.mutate()}
                size="sm"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Sending..." : "Notify me when available"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerContent className="px-0">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Pro Model Access Required</DrawerTitle>
          </DrawerHeader>
          {renderContent()}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="[&>button:last-child]:bg-background gap-0 overflow-hidden rounded-3xl p-0 shadow-xs sm:max-w-md [&>button:last-child]:rounded-full [&>button:last-child]:p-1">
        <DialogHeader className="sr-only">
          <DialogTitle>Pro Model Access Required</DialogTitle>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  )
}
