"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiClientError } from "@/lib/client/api";
import { Button, Field, Input } from "@/components/ui/primitives";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/auth/forgot-password", { email: email.trim() });
      setSent(true);
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
          <h1 className="text-2xl font-bold tracking-tight">Reset password</h1>
          <p className="mt-1 text-sm text-muted">We&apos;ll email you a reset link.</p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-surface p-6 shadow-sm">
          {sent ? (
            <div className="text-center">
              <p className="text-sm text-foreground">
                If an account exists for <span className="font-medium">{email}</span>, a reset link is on its way.
              </p>
              <p className="mt-2 text-xs text-muted">Check your inbox (and spam). The link is valid for 60 minutes.</p>
              <Link href="/login" className="mt-4 inline-block text-sm text-primary hover:underline">← Back to log in</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Field label="Email" htmlFor="email" required>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required autoFocus />
              </Field>
              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
              <Button type="submit" loading={loading} disabled={email.trim().length < 4} className="w-full">Send reset link</Button>
              <Link href="/login" className="text-center text-sm text-muted hover:text-foreground">← Back to log in</Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
