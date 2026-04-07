import type { ComponentType } from "react"
import type { MedicalBlockType } from "@/lib/clinical-workspace"
import {
  Flask,
  Heartbeat,
  FileText,
  Receipt,
  Pill,
  Image,
  Microphone,
  Warning,
  Clipboard,
  ArrowRight,
} from "@phosphor-icons/react"

export const BLOCK_ICONS: Record<
  MedicalBlockType,
  ComponentType<{ className?: string; weight?: string }>
> = {
  LAB: Flask,
  VITAL: Heartbeat,
  NOTE: FileText,
  SOAP: Clipboard,
  CLAIM: Receipt,
  BILLING: Receipt,
  PRESCRIPTION: Pill,
  IMAGING: Image,
  SCRIBE: Microphone,
  REFERRAL: ArrowRight,
  ALERT: Warning,
}

export const BLOCK_COLORS: Record<MedicalBlockType, string> = {
  LAB: "text-purple-500 bg-purple-500/10",
  VITAL: "text-emerald-500 bg-emerald-500/10",
  NOTE: "text-blue-500 bg-blue-500/10",
  SOAP: "text-indigo-500 bg-indigo-500/10",
  CLAIM: "text-amber-500 bg-amber-500/10",
  BILLING: "text-amber-500 bg-amber-500/10",
  PRESCRIPTION: "text-sky-500 bg-sky-500/10",
  IMAGING: "text-rose-500 bg-rose-500/10",
  SCRIBE: "text-red-500 bg-red-500/10",
  REFERRAL: "text-teal-500 bg-teal-500/10",
  ALERT: "text-orange-500 bg-orange-500/10",
}
