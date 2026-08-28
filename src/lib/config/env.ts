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

  // Phone OTP. `auto` uses SMSLocal when SMSLOCAL_API_KEY is set, else console
  // (logs the code — works with zero setup for dev / before DLT is live).
  OTP_PROVIDER: z.enum(["auto", "console", "smslocal"]).default("auto"),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  SMSLOCAL_API_KEY: z.string().optional(),
  SMSLOCAL_SENDER_ID: z.string().optional(), // DLT-approved 6-char header
  SMSLOCAL_TEMPLATE_ID: z.string().optional(), // DLT-approved OTP template id
  SMSLOCAL_OTP_VAR: z.string().default("otp"), // template variable name for the code
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
