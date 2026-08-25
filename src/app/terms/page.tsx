import type { Metadata } from "next";
import Link from "next/link";

const APP_URL = process.env.APP_URL ?? "https://smashhero.app";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "The terms for using Smash, including how your name and results may be used.",
  alternates: { canonical: `${APP_URL}/terms` },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-[var(--border)] bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm">🏸</span> Smash
          </Link>
          <Link href="/login" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-foreground">Terms &amp; Conditions</h1>
        <p className="mt-1 text-sm text-muted">In plain language. By creating an account you agree to the following.</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="font-semibold">1. Your account</h2>
            <p className="mt-1 text-muted">
              You&apos;re responsible for the activity on your account and for keeping your login secure.
              Provide accurate information and use Smash lawfully and respectfully toward other players.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">2. Using your name &amp; results for marketing</h2>
            <p className="mt-1 text-muted">
              You grant Smash permission to display and share your <strong>display name, match results,
              rankings, and public tournament activity</strong> to operate the app and to promote it —
              for example on public tournament and player pages, share cards, leaderboards, and in
              marketing materials. We will not publish your email, phone number, or password.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">3. Your content</h2>
            <p className="mt-1 text-muted">
              You keep ownership of what you add (tournaments, scores, comments). You grant Smash the
              rights needed to store and display it within the app and its public pages.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">4. Privacy</h2>
            <p className="mt-1 text-muted">
              Private tournaments stay visible only to their participants until an organizer makes them
              public. We take reasonable steps to protect your data but can&apos;t guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">5. Availability &amp; changes</h2>
            <p className="mt-1 text-muted">
              Smash is provided &quot;as is&quot;, without warranties, and may change or be unavailable at times.
              We may update these terms; continued use means you accept the updated version.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">6. Contact</h2>
            <p className="mt-1 text-muted">
              Questions or requests (including to stop featuring your name): contact support@smashhero.app.
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-[var(--border)] pt-6">
          <Link href="/login" className="text-sm font-medium text-primary hover:underline">← Back to sign in</Link>
        </div>
      </main>
    </div>
  );
}
