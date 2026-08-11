"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiClientError } from "@/lib/client/api";
import { Spinner } from "@/components/ui/primitives";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}

type State = "verifying" | "success" | "error";

function VerifyInner() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<State>(() => (token ? "verifying" : "error"));
  const [error, setError] = useState<string | null>(
    token ? null : "This link is missing its token."
  );
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !token) return;
    ran.current = true;
    api
      .post("/api/auth/verify-email", { token })
      .then(() => setState("success"))
      .catch((err) => {
        setState("error");
        setError(err instanceof ApiClientError ? err.message : "Verification failed.");
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-3xl">🏸</div>
        <div className="rounded-2xl border border-[var(--border)] bg-surface p-6 shadow-sm">
          {state === "verifying" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Spinner /> <p className="text-sm text-muted">Confirming your email…</p>
            </div>
          )}
          {state === "success" && (
            <>
              <p className="text-lg font-semibold text-foreground">✅ Email confirmed</p>
              <p className="mt-1 text-sm text-muted">Your account is verified.</p>
              <Link href="/dashboard" className="mt-4 inline-block text-sm text-primary hover:underline">Go to dashboard →</Link>
            </>
          )}
          {state === "error" && (
            <>
              <p className="text-lg font-semibold text-foreground">Couldn&apos;t verify</p>
              <p className="mt-1 text-sm text-[var(--danger)]">{error}</p>
              <Link href="/dashboard" className="mt-4 inline-block text-sm text-primary hover:underline">
                Go to dashboard (you can resend from there)
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
