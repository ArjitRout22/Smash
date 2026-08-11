"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiClientError } from "@/lib/client/api";
import { Button, Field, Input } from "@/components/ui/primitives";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && password !== confirm ? "Passwords don't match" : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mismatch) return;
    setLoading(true);
    try {
      await api.post("/api/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-3xl">🏸</div>
          <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-surface p-6 shadow-sm">
          {!token ? (
            <div className="text-center text-sm text-muted">
              This reset link is missing its token. Please request a new one.
              <div className="mt-3"><Link href="/forgot-password" className="text-primary hover:underline">Request a reset link</Link></div>
            </div>
          ) : done ? (
            <p className="text-center text-sm text-foreground">✅ Password updated. Redirecting you to log in…</p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Field label="New password" htmlFor="password" required hint="At least 8 characters.">
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" required minLength={8} autoFocus />
              </Field>
              <Field label="Confirm password" htmlFor="confirm" required error={mismatch}>
                <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" required />
              </Field>
              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
              <Button type="submit" loading={loading} disabled={password.length < 8 || Boolean(mismatch)} className="w-full">Reset password</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
