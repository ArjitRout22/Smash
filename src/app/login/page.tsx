"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiClientError } from "@/lib/client/api";
import { Button, Field, Input, PasswordInput } from "@/components/ui/primitives";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

type Mode = "login" | "register" | "phone";
type Phase = "phone" | "code" | "password"; // phone-flow steps

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();

  const [mode, setMode] = useState<Mode>(search.get("mode") === "register" ? "register" : "login");
  const [form, setForm] = useState({
    name: "",
    email: search.get("email") ?? "",
    identifier: "",
    password: "",
    phone: "",
    code: "",
    newPassword: "",
  });
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phone flow.
  const [phase, setPhase] = useState<Phase>("phone");
  const [masked, setMasked] = useState<string | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setPhase("phone");
    setNeedsProfile(false);
    setForm((f) => ({ ...f, code: "", newPassword: "" }));
  }

  function afterAuth() {
    router.push(search.get("next") || "/dashboard");
    router.refresh();
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await api.post("/api/auth/register", {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          acceptedTerms: agree,
        });
      } else {
        await api.post("/api/auth/login", { identifier: form.identifier.trim(), password: form.password });
      }
      afterAuth();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "CONFLICT" && mode === "register") {
        setMode("login");
        setForm((f) => ({ ...f, identifier: f.email.trim() }));
        setError("That email is already registered — please log in.");
      } else {
        setError(err instanceof ApiClientError ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  }

  async function sendCode() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ masked: string }>("/api/auth/otp/start", { phone: form.phone.trim() });
      setMasked(res.masked);
      setPhase("code");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not send the code");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ needsProfile?: boolean; hasPassword?: boolean }>("/api/auth/otp/verify", {
        phone: form.phone.trim(),
        code: form.code.trim(),
        ...(needsProfile ? { name: form.name.trim(), acceptedTerms: agree, email: form.email.trim() || undefined } : {}),
      });
      if (res.needsProfile) {
        setNeedsProfile(true);
        return;
      }
      // Signed in. Offer to set a password (so next time is a free password login,
      // no code) unless they already have one.
      if (res.hasPassword) afterAuth();
      else setPhase("password");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function savePassword() {
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/auth/password/set", { password: form.newPassword });
      afterAuth();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save password");
      setLoading(false);
    }
  }

  const emailCanSubmit =
    mode === "register"
      ? form.email.trim().length > 3 && form.password.length >= 8 && form.name.trim().length >= 2 && agree
      : form.identifier.trim().length > 2 && form.password.length >= 1;
  const verifyCanSubmit = /^\d{6}$/.test(form.code.trim()) && (!needsProfile || (form.name.trim().length >= 2 && agree));

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-3xl">🏸</div>
          <h1 className="text-2xl font-bold tracking-tight">Smash</h1>
          <p className="mt-1 text-sm text-muted">Badminton tournament manager</p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-surface p-6 shadow-sm">
          <div className="mb-5 flex rounded-lg bg-surface-2 p-1 text-sm font-medium">
            {([
              ["login", "Log in"],
              ["register", "Sign up"],
              ["phone", "Phone"],
            ] as [Mode, string][]).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 rounded-md py-1.5 transition ${mode === m ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "phone" ? (
            phase === "password" ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted">
                  You&apos;re in! Set a password so you can log in with your number next time — no code needed.
                </p>
                <Field label="Create a password" htmlFor="newpw" hint="At least 8 characters. Tap the eye to check it.">
                  <PasswordInput id="newpw" value={form.newPassword} onChange={set("newPassword")} placeholder="••••••••" autoComplete="new-password" minLength={8} autoFocus />
                </Field>
                {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
                <Button onClick={savePassword} loading={loading} disabled={form.newPassword.length < 8} className="w-full">
                  Save password
                </Button>
                <button type="button" onClick={afterAuth} className="text-center text-xs text-muted hover:text-foreground">
                  Skip for now
                </button>
              </div>
            ) : (
              <form onSubmit={verifyCode} className="flex flex-col gap-4">
                <Field label="Phone number" htmlFor="phone" required hint="Include your country code, e.g. +91 98765 43210">
                  <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="+91 98765 43210" autoComplete="tel" autoFocus disabled={phase === "code"} required />
                </Field>

                {phase === "phone" ? (
                  <Button type="button" loading={loading} disabled={form.phone.trim().length < 6} onClick={sendCode} className="w-full">
                    Send code
                  </Button>
                ) : (
                  <>
                    <Field label="Enter code" htmlFor="code" required hint={masked ? `Sent to ${masked}` : undefined}>
                      <Input id="code" inputMode="numeric" value={form.code} onChange={set("code")} placeholder="6-digit code" autoComplete="one-time-code" autoFocus maxLength={6} required />
                    </Field>

                    {needsProfile && (
                      <>
                        <p className="text-sm text-muted">Looks like you&apos;re new — a couple of details to finish:</p>
                        <Field label="Full name" htmlFor="pname" required>
                          <Input id="pname" value={form.name} onChange={set("name")} placeholder="Arjit Rout" autoComplete="name" required />
                        </Field>
                        <Field label="Email" htmlFor="pemail" hint="Optional — for notifications">
                          <Input id="pemail" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" autoComplete="email" />
                        </Field>
                        <label className="flex items-start gap-2 text-xs text-muted">
                          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" required />
                          <span>
                            I agree to the <Link href="/terms" target="_blank" className="text-primary hover:underline">Terms &amp; Conditions</Link>, and allow Smash to feature my name and results to promote the app.
                          </span>
                        </label>
                      </>
                    )}

                    {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
                    <Button type="submit" loading={loading} disabled={!verifyCanSubmit} className="w-full">
                      {needsProfile ? "Create account" : "Continue"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => { setPhase("phone"); setNeedsProfile(false); setForm((f) => ({ ...f, code: "" })); setError(null); }}
                      className="text-center text-xs text-muted hover:text-foreground"
                    >
                      Change number or resend code
                    </button>
                  </>
                )}
                {phase === "phone" && error && <p className="text-sm text-[var(--danger)]">{error}</p>}
              </form>
            )
          ) : (
            <form onSubmit={submitEmail} className="flex flex-col gap-4">
              {mode === "register" && (
                <Field label="Full name" htmlFor="name" required>
                  <Input id="name" value={form.name} onChange={set("name")} placeholder="Arjit Rout" autoComplete="name" autoFocus required />
                </Field>
              )}
              {mode === "register" ? (
                <Field label="Email" htmlFor="email" required>
                  <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" autoComplete="email" required />
                </Field>
              ) : (
                <Field label="Email or phone number" htmlFor="identifier" required>
                  <Input id="identifier" value={form.identifier} onChange={set("identifier")} placeholder="you@example.com or +91…" autoComplete="username" autoFocus required />
                </Field>
              )}
              <Field label="Password" htmlFor="password" required hint={mode === "register" ? "At least 8 characters. Tap the eye to check it." : undefined}>
                <PasswordInput id="password" value={form.password} onChange={set("password")} placeholder="••••••••" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 8 : undefined} />
              </Field>

              {mode === "login" && (
                <div className="-mt-2 text-right">
                  <Link href="/forgot-password" className="text-xs text-muted hover:text-foreground">Forgot password?</Link>
                </div>
              )}

              {mode === "register" && (
                <label className="flex items-start gap-2 text-xs text-muted">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" required />
                  <span>
                    I agree to the <Link href="/terms" target="_blank" className="text-primary hover:underline">Terms &amp; Conditions</Link>, and allow Smash to feature my name and results to promote the app.
                  </span>
                </label>
              )}

              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
              <Button type="submit" loading={loading} disabled={!emailCanSubmit} className="w-full">
                {mode === "register" ? "Create account" : "Log in"}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button type="button" onClick={() => switchMode(mode === "login" ? "register" : "login")} className="text-primary hover:underline">
            {mode === "login" ? "Create an account" : "Log in instead"}
          </button>
        </p>
      </div>
    </div>
  );
}
