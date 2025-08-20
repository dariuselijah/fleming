import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  // Minimal middleware that just passes through
  // This resolves the export requirement while we debug the full middleware
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
