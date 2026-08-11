import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getEnv } from "@/lib/config/env";
import { Errors } from "@/lib/errors";
import type { CountryCode } from "libphonenumber-js";

/**
 * Validate and normalize a phone number to E.164 (e.g. "+919876543210").
 * Numbers without a country code are interpreted using DEFAULT_PHONE_REGION.
 * Throws a VALIDATION_ERROR AppError on invalid input.
 */
export function normalizePhone(raw: string): string {
  const region = getEnv().DEFAULT_PHONE_REGION as CountryCode;
  const parsed = parsePhoneNumberFromString(raw?.trim() ?? "", region);
  if (!parsed || !parsed.isValid()) {
    throw Errors.validation("Please enter a valid phone number");
  }
  return parsed.number; // E.164
}

/** Mask for display/logs: +9198****3210 */
export function maskPhone(e164: string): string {
  if (e164.length < 6) return "****";
  return `${e164.slice(0, 4)}****${e164.slice(-4)}`;
}
