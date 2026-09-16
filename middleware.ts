import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { isSupabaseEnabled } from "@/lib/supabase/config"

// These pages authenticate with an opaque, purpose-bound token in their page/API
// handlers. Middleware must not require a Supabase session before that validation.
const PUBLIC_PATH_PREFIXES = [
  "/auth",
  "/terms",
  "/privacy",
  "/scan/patient",
  "/portal",
  "/verify",
  "/invite",
  "/share",
]

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATH_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    return NextResponse.next({ request })
  }

  const redirectToAuth = () => {
    const url = request.nextUrl.clone()
    url.pathname = "/auth"
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(url)
  }

  if (!isSupabaseEnabled) {
    return redirectToAuth()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirectToAuth()
  }

  return response
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
