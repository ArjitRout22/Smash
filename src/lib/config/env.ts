import { z } from "zod";

/**
 * Server-side environment configuration, validated once at startup.
 * NEVER import this from client components — it reads secrets.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),

  DEFAULT_PHONE_REGION: z.string().default("IN"),

  // Email (password reset). `auto` uses Resend when a key is present, else console.
  EMAIL_PROVIDER: z.enum(["auto", "console", "resend"]).default("auto"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Smash <onboarding@resend.dev>"),
  PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Shared secret guarding the reminder cron route. Vercel Cron auto-sends it as
  // `Authorization: Bearer $CRON_SECRET` when set. If unset, the route is open
  // (fine for local dev; set it in production).
  CRON_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => getEnv().NODE_ENV === "production";
export const isDev = () => getEnv().NODE_ENV === "development";
export const isTest = () => getEnv().NODE_ENV === "test";
