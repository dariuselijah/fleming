import { PROVIDERS } from "@/lib/providers"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

const SUPPORTED_PROVIDERS = PROVIDERS.map((p) => p.id)

export async function GET() {
  try {
    console.log("GET /api/user-key-status called")
    const supabase = await createClient()
    if (!supabase) {
      console.log("Supabase client not available")
      return NextResponse.json(
        { error: "Supabase not available" },
        { status: 500 }
      )
    }

    console.log("Getting user from auth...")
    const { data: authData, error: authError } = await supabase.auth.getUser()

    console.log("Auth result:", { 
      user: authData?.user ? { id: authData.user.id, email: authData.user.email } : null, 
      error: authError?.message 
    })

    if (!authData?.user?.id) {
      console.log("User not authenticated")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("User authenticated, fetching user keys...")
    const { data, error } = await supabase
      .from("user_keys")
      .select("provider")
      .eq("user_id", authData.user.id)

    if (error) {
      console.error("Error fetching user keys:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log("User keys fetched successfully")
    // Create status object for all supported providers
    const userProviders = data?.map((k) => k.provider) || []
    const providerStatus = SUPPORTED_PROVIDERS.reduce(
      (acc, provider) => {
        acc[provider] = userProviders.includes(provider)
        return acc
      },
      {} as Record<string, boolean>
    )

    return NextResponse.json(providerStatus)
  } catch (err) {
    console.error("Key status error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
