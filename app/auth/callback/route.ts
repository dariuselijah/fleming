import { DEFAULT_FAVORITE_MODELS } from "@/lib/config"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createGuestServerClient } from "@/lib/supabase/server-guest"
import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"

function postAuthRedirectUrl(request: NextRequest, nextPath: string): string {
  // Prefer nextUrl.origin so scheme/host match the incoming request (localhost, LAN IP, prod).
  return `${request.nextUrl.origin}${nextPath}`
}

export async function GET(request: NextRequest) {
  console.log("Auth callback called")
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const rawNext = searchParams.get("next") ?? "/"
  const nextPath =
    rawNext.startsWith("/") && !rawNext.includes("//") ? rawNext : "/"
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  console.log("Code:", code ? "present" : "missing")
  console.log("Next:", nextPath)
  console.log("Error:", error)
  console.log("Error description:", errorDescription)

  if (error) {
    console.error("OAuth error:", error, errorDescription)
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent(errorDescription || error)}`
    )
  }

  if (!isSupabaseEnabled) {
    console.log("Supabase not enabled")
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent("Supabase is not enabled in this deployment.")}`
    )
  }

  if (!code) {
    console.log("No code provided")
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent("Missing authentication code")}`
    )
  }

  const supabaseAdmin = await createGuestServerClient()

  if (!supabaseAdmin) {
    console.log("Supabase admin client not available")
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent("Supabase is not enabled in this deployment.")}`
    )
  }

  // Build redirect first, then attach Set-Cookie on this same response.
  // Using cookies() + a separate NextResponse.redirect drops session cookies (Auth session missing).
  const destination = postAuthRedirectUrl(request, nextPath)
  const response = NextResponse.redirect(destination)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  console.log("Exchanging code for session...")
  const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

  if (sessionError) {
    console.error("Auth error:", sessionError)
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent(sessionError.message)}`
    )
  }

  console.log("Session exchanged successfully")
  const user = data?.user
  if (!user || !user.id || !user.email) {
    console.log("No user data in session")
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent("Missing user info")}`
    )
  }

  console.log("User authenticated:", user.email)

  try {
    // Try to insert user only if not exists
    const { error: insertError } = await supabaseAdmin.from("users").insert({
      id: user.id,
      email: user.email,
      created_at: new Date().toISOString(),
      message_count: 0,
      premium: false,
      favorite_models: DEFAULT_FAVORITE_MODELS,
    })

    if (insertError && insertError.code !== "23505") {
      console.error("Error inserting user:", insertError)
    } else {
      console.log("User record created/updated successfully")
    }
  } catch (err) {
    console.error("Unexpected user insert error:", err)
  }

  console.log("Redirecting to:", destination)
  return response
}
