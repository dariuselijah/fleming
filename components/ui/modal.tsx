"use client"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

const modalContentVariants = cva(
  "max-h-[min(calc(100dvh-2rem),48rem)] gap-0 overflow-hidden border-panel-border bg-overlay p-0 text-overlay-foreground shadow-floating",
  {
    variants: {
      size: {
        sm: "sm:max-w-sm",
        md: "sm:max-w-lg",
        lg: "sm:max-w-2xl",
        xl: "sm:max-w-4xl",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

function ModalContent({
  className,
  size,
  ...props
}: React.ComponentProps<typeof DialogContent> &
  VariantProps<typeof modalContentVariants>) {
  return (
    <DialogContent
      data-slot="modal-content"
      className={cn(modalContentVariants({ size }), className)}
      {...props}
    />
  )
}

function ModalHeader({
  className,
  ...props
}: React.ComponentProps<typeof DialogHeader>) {
  return (
    <DialogHeader
      data-slot="modal-header"
      className={cn(
        "gap-1 border-b border-panel-border px-5 py-4 text-left",
        className
      )}
      {...props}
    />
  )
}

function ModalBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-body"
      className={cn("min-h-0 overflow-y-auto px-5 py-4", className)}
      {...props}
    />
  )
}

function ModalFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooter>) {
  return (
    <DialogFooter
      data-slot="modal-footer"
      className={cn(
        "border-t border-panel-border bg-panel-muted/40 px-5 py-4",
        className
      )}
      {...props}
    />
  )
}

const Modal = Dialog
const ModalTrigger = DialogTrigger
const ModalClose = DialogClose
const ModalTitle = DialogTitle
const ModalDescription = DialogDescription

export {
  Modal,
  ModalBody,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  modalContentVariants,
}
