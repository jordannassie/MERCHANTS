import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/**
 * OAuth / magic-link callback.
 *
 * Writes Set-Cookie headers onto the redirect response so the browser
 * stores the session before following the redirect. On Netlify the
 * internal request.host differs from the public domain — prefer
 * NEXT_PUBLIC_SITE_URL or x-forwarded-host.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    (forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : new URL(request.url).origin);

  const providerError =
    searchParams.get("error_code") ?? searchParams.get("error");
  if (providerError) {
    console.error("[auth/callback] provider error:", providerError);
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_provider_error`);
  }

  if (!code) {
    console.error("[auth/callback] no code in request");
    return NextResponse.redirect(`${baseUrl}/login?error=missing_oauth_code`);
  }

  const next = searchParams.get("next") ?? "/dashboard";
  const safePath = next.startsWith("/") ? next : "/dashboard";

  const successResponse = NextResponse.redirect(`${baseUrl}${safePath}`);
  const errorResponse = NextResponse.redirect(
    `${baseUrl}/login?error=oauth_callback_failed`
  );

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            successResponse.cookies.set(name, value, options);
            errorResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    return errorResponse;
  }

  return successResponse;
}
