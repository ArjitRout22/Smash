import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

/**
 * Edge middleware: a cheap first gate based on cookie presence.
 * It does NOT trust the cookie's contents — full cryptographic + DB-backed
 * verification happens server-side (getAuthUser) in layouts and API routes.
 */
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/verify-email"];
// Accessible whether or not signed in, and never redirected away (e.g. a
// logged-in user clicking their email-confirmation link).
const OPEN_PATHS = ["/verify-email"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // The marketing home is public for everyone (signed in or not) — never gate or
  // redirect it, so a shared smashhero.app link lands on the landing page.
  if (pathname === "/") return NextResponse.next();
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isOpen = OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && isPublic && !isOpen) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except API routes, Next internals, static assets, and the
  // PWA files (service worker / manifest / offline page must load without auth).
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|offline.html|robots.txt|sitemap.xml|explore|t/|player/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
