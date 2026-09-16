import { createHash, randomBytes } from "crypto"
import type { PrescriptionItem } from "@/lib/clinical-workspace/types"

export function hashPrescriptionPayload(items: PrescriptionItem[]): string {
  const normalized = items
    .filter((i) => i.drug?.trim())
    .map((i) => ({
      drug: i.drug.trim(),
      strength: i.strength ?? "",
      route: i.route ?? "",
      frequency: i.frequency ?? "",
      duration: i.duration ?? "",
      instructions: i.instructions ?? "",
    }))
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

export function generateVerificationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url")
  const tokenHash = createHash("sha256").update(token).digest("hex")
  return { token, tokenHash }
}

export function verifyUrlForToken(token: string, origin?: string): string {
  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  return `${base.replace(/\/$/, "")}/verify/rx/${encodeURIComponent(token)}`
}
