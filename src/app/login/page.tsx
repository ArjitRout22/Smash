"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiClientError } from "@/lib/client/api";
import { Button, Field, Input } from "@/components/ui/primitives";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

type Mode = "login" | "register";

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();

  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await api.post("/api/auth/register", {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
        });
      } else {
        await api.post("/api/auth/login", { email: form.email.trim(), password: form.password });
      }
      const next = search.get("next") || "/dashboard";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    form.email.trim().length > 3 &&
    form.password.length >= (mode === "register" ? 8 : 1) &&
    (mode === "login" || form.name.trim().length >= 2);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-3xl">
            🏸
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Smash</h1>
          <p className="mt-1 text-sm text-muted">Badminton tournament manager</p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-surface p-6 shadow-sm">
          <div className="mb-5 flex rounded-lg bg-surface-2 p-1 text-sm font-medium">
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 rounded-md py-1.5 capitalize transition ${
                  mode === m ? "bg-surface text-foreground shadow-sm" : "text-muted"
                }`}
              >
                {m === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            {mode === "register" && (
              <Field label="Full name" htmlFor="name" required>
                <Input id="name" value={form.name} onChange={set("name")} placeholder="Arjit Rout" autoComplete="name" autoFocus required />
              </Field>
            )}
            <Field label="Email" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus={mode === "login"}
                required
              />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              required
              hint={mode === "register" ? "At least 8 characters." : undefined}
            >
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={set("password")}
                placeholder="••••••••"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                required
                minLength={mode === "register" ? 8 : undefined}
              />
            </Field>

            {mode === "login" && (
              <div className="-mt-2 text-right">
                <Link href="/forgot-password" className="text-xs text-muted hover:text-foreground">
                  Forgot password?
                </Link>
              </div>
            )}

            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

            <Button type="submit" loading={loading} disabled={!canSubmit} className="w-full">
              {mode === "register" ? "Create account" : "Log in"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
            className="text-primary hover:underline"
          >
            {mode === "login" ? "Create an account" : "Log in instead"}
          </button>
        </p>
      </div>
    </div>
  );
}
