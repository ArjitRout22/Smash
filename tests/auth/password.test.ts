import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing (scrypt)", () => {
  it("verifies a correct password", () => {
    const stored = hashPassword("s3cret-pw!");
    expect(verifyPassword("s3cret-pw!", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("s3cret-pw!");
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("uses a random salt (same password → different hashes)", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("stores salt:hash in hex and never the plaintext", () => {
    const stored = hashPassword("hunter2");
    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(stored).not.toContain("hunter2");
  });

  it("returns false for missing/malformed stored values", () => {
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "no-colon")).toBe(false);
  });
});
