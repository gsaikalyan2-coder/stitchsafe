import { auth } from "@/server/auth/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
}

const PUBLIC_PATHS = ["/login", "/api/"]

export async function proxy(req: NextRequest): Promise<NextResponse | undefined> {
  const { pathname } = req.nextUrl

  // A signed-in user must never start another provider sign-in from /login: Auth.js would
  // LINK that provider (e.g. PayPal) to the CURRENT user instead of signing in someone else.
  if (pathname === "/login") {
    const current = await auth()
    if (current?.user) {
      const dashboardUrl = req.nextUrl.clone()
      dashboardUrl.pathname = current.user.role === "TAILOR" ? "/tailor" : "/customer"
      dashboardUrl.search = ""
      return NextResponse.redirect(dashboardUrl)
    }
    return undefined
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  if (isPublic) return undefined

  const session = await auth()
  if (!session?.user) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = "/login"
    return NextResponse.redirect(loginUrl)
  }

  return undefined
}
