"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Trophy,
  Compass,
  Users,
  Swords,
  Zap,
  BarChart3,
  UserCircle,
  ShieldAlert,
  HelpCircle,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/primitives";
import { NavProgress } from "@/components/NavProgress";
import { InstallPrompt } from "@/components/InstallPrompt";
import { api } from "@/lib/client/api";

// Teams aren't a top-level destination — they're built inside a tournament
// (its Teams tab), so the standalone entry was dropped from the nav.
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/players", label: "Players", icon: Users },
  { href: "/matches", label: "Matches", icon: Swords },
  { href: "/challenges", label: "Challenges", icon: Zap },
  { href: "/leaderboard", label: "Leaderboard", icon: BarChart3 },
  { href: "/profile", label: "Profile", icon: UserCircle },
  { href: "/help", label: "Help", icon: HelpCircle },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav =
    user?.role === "ADMIN"
      ? [...NAV, { href: "/admin", label: "Admin", icon: ShieldAlert }]
      : NAV;

  return (
    <div className="flex min-h-screen">
      <NavProgress />
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--border)] bg-surface p-4 md:flex">
        <Brand />
        <div className="mt-6 flex-1">
          <NavLinks pathname={pathname} items={nav} />
        </div>
        <UserFooter name={user?.name ?? user?.phone ?? ""} role={user?.role ?? ""} onLogout={logout} />
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border)] bg-surface px-4 py-3 md:hidden">
          <Brand />
          <button aria-label="Menu" onClick={() => setMobileOpen(true)}>
            <Menu className="h-6 w-6" />
          </button>
        </header>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <div className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-[var(--border)] bg-surface p-4">
              <div className="flex items-center justify-between">
                <Brand />
                <button aria-label="Close menu" onClick={() => setMobileOpen(false)}>
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="mt-6 flex-1">
                <NavLinks pathname={pathname} items={nav} onNavigate={() => setMobileOpen(false)} />
              </div>
              <UserFooter name={user?.name ?? user?.phone ?? ""} role={user?.role ?? ""} onLogout={logout} />
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
          {user && !user.emailVerified && <VerifyEmailBanner email={user.email} />}
          <InstallPrompt />
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLinks({
  pathname,
  items,
  onNavigate,
}: {
  pathname: string;
  items: { href: string; label: string; icon: typeof LayoutDashboard }[];
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:bg-surface-2 hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function VerifyEmailBanner({ email }: { email: string | null }) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  async function resend() {
    setLoading(true);
    await api.post("/api/auth/resend-verification").catch(() => undefined);
    setLoading(false);
    setSent(true);
  }
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="text-amber-700 dark:text-amber-300">
        Please confirm your email{email ? ` (${email})` : ""} to secure your account.
      </span>
      {sent ? (
        <span className="text-xs text-muted">Verification link sent — check your inbox.</span>
      ) : (
        <button onClick={resend} disabled={loading} className="shrink-0 rounded-md bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-500/30 disabled:opacity-50 dark:text-amber-200">
          {loading ? "Sending…" : "Resend link"}
        </button>
      )}
    </div>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">🏸</span>
      <span className="text-lg font-bold tracking-tight">Smash</span>
    </Link>
  );
}

function UserFooter({ name, role, onLogout }: { name: string; role: string; onLogout: () => void }) {
  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <div className="mb-2 px-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs capitalize text-muted">{role.toLowerCase()}</p>
      </div>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onLogout}>
        <LogOut className="h-4 w-4" /> Log out
      </Button>
    </div>
  );
}
