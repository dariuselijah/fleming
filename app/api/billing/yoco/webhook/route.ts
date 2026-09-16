import { NextResponse } from "next/server"
import { disabledPaymentProviderReason } from "@/lib/billing/providers/availability"

export async function POST() {
  return NextResponse.json(
    {
      error: disabledPaymentProviderReason("yoco"),
      code: "PAYMENT_PROVIDER_NOT_CERTIFIED",
    },
    { status: 503 }
  )
}
