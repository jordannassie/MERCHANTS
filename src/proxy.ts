import { NextResponse, type NextRequest } from 'next/server'

/**
 * Minimal passthrough middleware.
 * Merchant Radar has no authentication — /login redirects directly to /dashboard.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }
  return NextResponse.next({ request })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
