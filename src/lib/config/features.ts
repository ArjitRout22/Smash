/**
 * Feature flags — safe to import from BOTH server and client code (unlike
 * `env.ts`, this reads only public `NEXT_PUBLIC_*` values, never secrets).
 */

/**
 * Phone number + OTP sign-in.
 *
 * The whole phone/OTP path (UI tab, OTP endpoints, SMS provider) is fully built
 * and tested but HIDDEN by default. Delivering OTP SMS in India requires a
 * DLT-registered sender, which in turn requires a registered company — SmashHero
 * isn't one yet, and every Indian SMS route (SMSLocal included) enforces DLT. So
 * the feature stays dark until we either register the entity or adopt a provider
 * that doesn't require DLT.
 *
 * To re-enable with zero code changes: set `NEXT_PUBLIC_PHONE_AUTH_ENABLED=true`
 * at build time (Vercel env). When off, the Phone tab is hidden and the OTP /
 * phone-link endpoints return 404.
 */
export function phoneAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PHONE_AUTH_ENABLED === "true";
}
