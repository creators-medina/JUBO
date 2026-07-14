import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup");

  // Inbound webhooks (secret token) and the cron worker (CRON_SECRET) authenticate
  // themselves — they have no user session and must never be redirected to /login.
  const isPublicApi =
    request.nextUrl.pathname.startsWith("/api/webhooks") ||
    request.nextUrl.pathname.startsWith("/api/cron");

  // Invite acceptance must be reachable while logged OUT — the page itself
  // routes the user to sign up / log in, preserving the token.
  const isInviteRoute = request.nextUrl.pathname.startsWith("/invite");

  // Password-reset routes must be reachable while logged OUT (request a link) and
  // must NOT be treated as auth routes, so a recovery session reaching
  // /reset-password is not bounced to /dashboard before setting a new password.
  const isRecoveryRoute =
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/reset-password");

  if (!user && !isAuthRoute && !isPublicApi && !isInviteRoute && !isRecoveryRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
