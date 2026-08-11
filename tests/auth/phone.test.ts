import { describe, it, expect } from "vitest";
import { normalizePhone, maskPhone } from "@/lib/auth/phone";
import { AppError } from "@/lib/errors";

describe("phone normalization", () => {
  it("normalizes a national Indian number to E.164 (default region IN)", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
    expect(normalizePhone("098765 43210")).toBe("+919876543210");
  });

  it("accepts an explicit international number", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
  });

  it("rejects clearly invalid input", () => {
    expect(() => normalizePhone("123")).toThrow(AppError);
    expect(() => normalizePhone("")).toThrow(AppError);
    expect(() => normalizePhone("not-a-number")).toThrow(AppError);
  });

  it("masks a number for display", () => {
    expect(maskPhone("+919876543210")).toBe("+919****3210");
  });
});
