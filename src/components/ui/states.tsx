"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Inbox, AlertTriangle } from "lucide-react";
import { Skeleton, Button } from "./primitives";

const LOADING_MESSAGES = [
  "Warming up the shuttles…",
  "Chalking the court lines…",
  "Stringing the rackets…",
  "Tossing for serve…",
  "Lining up the rally…",
];

function ShuttleSpinner() {
  return (
    <div className="relative h-14 w-14" role="status" aria-label="Loading">
      <div className="absolute inset-0 animate-spin rounded-full border-2 border-[var(--surface-2)] border-t-[var(--primary)]" />
      <div className="absolute inset-0 flex items-center justify-center text-2xl">🏸</div>
    </div>
  );
}

/**
 * Full-height branded loader for meaningful waits (initial app load, slow
 * pages). Cycles through playful badminton messages so a slow load feels alive.
 */
export function BrandedLoader({ message, className }: { message?: string; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (message) return;
    const t = setInterval(() => setI((n) => (n + 1) % LOADING_MESSAGES.length), 1600);
    return () => clearInterval(t);
  }, [message]);
  return (
    <div className={clsx("flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center", className)}>
      <ShuttleSpinner />
      <p className="animate-pulse text-sm font-medium text-muted">{message ?? LOADING_MESSAGES[i]}</p>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  message?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-surface px-6 py-14 text-center">
      <Icon className="mb-3 h-10 w-10 text-muted" />
      <h3 className="font-semibold text-foreground">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-surface px-6 py-12 text-center">
      <AlertTriangle className="mb-3 h-10 w-10 text-[var(--danger)]" />
      <h3 className="font-semibold text-foreground">Something went wrong</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{message ?? "Please try again."}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}
