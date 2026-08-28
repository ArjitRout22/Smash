import { describe, it, expect, beforeAll, vi } from "vitest";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { authByPhone, addVerifiedPhone, register, login, setPassword } from "@/lib/auth/service";
import { startOtp, verifyOtp } from "@/lib/auth/otp";
import { getOtpProvider } from "@/lib/otp/provider";

const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// Seed a known code for a phone (bypasses SMS delivery) so we can verify flows.
async function issue(phone: string, code: string, opts?: { expiresAt?: Date; attempts?: number }) {
  await prisma.otpVerification.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: new Date() } });
  return prisma.otpVerification.create({
    data: {
      phone,
      codeHash: sha(code),
      attempts: opts?.attempts ?? 0,
      expiresAt: opts?.expiresAt ?? new Date(Date.now() + 5 * 60_000),
    },
  });
}

// Unique-ish Indian mobile per call so suites don't collide on the unique phone.
let n = 6000;
const nextPhone = () => `+9199${String(Date.now()).slice(-5)}${String(n++).slice(-3)}`;

d("phone + OTP auth (integration)", () => {
  beforeAll(async () => {
    await prisma.role.upsert({ where: { name: "ORGANIZER" }, update: {}, create: { name: "ORGANIZER", description: "org" } });
  });

  it("startOtp sends a 6-digit code and stores only its hash", async () => {
    const phone = nextPhone();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await startOtp(phone);
    spy.mockRestore();
    expect(res.masked).toMatch(/\*\*\*\*/);
    const row = await prisma.otpVerification.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } });
    expect(row).toBeTruthy();
    expect(row!.codeHash).toHaveLength(64); // sha256 hex, never the raw code
    expect(getOtpProvider().name).toBe("console"); // no SMSLOCAL key in tests
  });

  it("registers a brand-new phone (own org + ORGANIZER + player), then logs in on the next code", async () => {
    const phone = nextPhone();
    await issue(phone, "111111");
    const created = await authByPhone({ phone, code: "111111", name: "Phone Player", acceptedTerms: true });
    expect("user" in created && created.user).toBeTruthy();

    const user = await prisma.user.findUnique({ where: { phone }, include: { role: true, player: true } });
    expect(user).toBeTruthy();
    expect(user!.phoneVerifiedAt).toBeTruthy();
    expect(user!.role.name).toBe("ORGANIZER");
    expect(user!.organizationId).toBeTruthy();
    expect(user!.player?.phone).toBe(phone);
    expect(user!.passwordHash).toBeNull();

    // A fresh code → logs into the SAME account (no name needed).
    await issue(phone, "222222");
    const loggedIn = await authByPhone({ phone, code: "222222" });
    expect("user" in loggedIn && (loggedIn as { user: { id: string } }).user.id).toBe(user!.id);
  });

  it("a new phone with no name asks for a profile instead of creating a broken account", async () => {
    const phone = nextPhone();
    await issue(phone, "333333");
    const res = await authByPhone({ phone, code: "333333" });
    expect(res).toEqual({ needsProfile: true });
    expect(await prisma.user.findUnique({ where: { phone } })).toBeNull();
  });

  it("the needsProfile probe does NOT consume the code — the same code finishes signup (UI two-call flow)", async () => {
    const phone = nextPhone();
    await issue(phone, "343434");

    // Call 1 (the UI's first verify): code only → asks for a profile, code stays valid.
    const probe = await authByPhone({ phone, code: "343434" });
    expect(probe).toEqual({ needsProfile: true });
    const row = await prisma.otpVerification.findFirst({ where: { phone } });
    expect(row!.consumedAt).toBeNull(); // still usable

    // Call 2 (the UI's second verify): SAME code + name + Terms → account created.
    const created = await authByPhone({ phone, code: "343434", name: "Two Call", acceptedTerms: true });
    expect("user" in created && created.user).toBeTruthy();
    expect((created as { hasPassword: boolean }).hasPassword).toBe(false);
    expect(await prisma.user.findUnique({ where: { phone } })).toBeTruthy();

    // The code is now consumed — reusing it (even as a returning login) is rejected.
    expect((await prisma.otpVerification.findFirst({ where: { phone } }))!.consumedAt).not.toBeNull();
    await expect(authByPhone({ phone, code: "343434" })).rejects.toThrow(/invalid or has expired/i);
  });

  it("rejects a wrong code, an expired code, and locks out after too many attempts", async () => {
    const phone = nextPhone();
    await issue(phone, "444444");
    await expect(verifyOtp(phone, "000000")).rejects.toThrow(/invalid or has expired/i);

    // expired
    await issue(phone, "555555", { expiresAt: new Date(Date.now() - 1000) });
    await expect(verifyOtp(phone, "555555")).rejects.toThrow(/invalid or has expired/i);

    // lockout: a fresh code already at maxAttempts → next wrong attempt is the 6th
    await issue(phone, "666666", { attempts: 5 });
    await expect(verifyOtp(phone, "000000")).rejects.toThrow(/too many/i);
    // and the row is now consumed, so even the RIGHT code fails
    await expect(verifyOtp(phone, "666666")).rejects.toThrow(/invalid or has expired/i);
  });

  it("phone signup → set a password → log in with phone + password (no OTP)", async () => {
    const phone = nextPhone();
    await issue(phone, "121212");
    const signup = await authByPhone({ phone, code: "121212", name: "PW Player", acceptedTerms: true });
    expect("hasPassword" in signup && signup.hasPassword).toBe(false); // offered to set one
    const userId = (signup as { user: { id: string } }).user.id;

    await setPassword(userId, "s3cretpass");
    const loggedIn = await login({ identifier: phone, password: "s3cretpass" });
    expect(loggedIn.user.id).toBe(userId);
    await expect(login({ identifier: phone, password: "wrong-one" })).rejects.toThrow(/invalid login/i);

    // Changing an existing password needs the current one.
    await expect(setPassword(userId, "newpass12", "nope")).rejects.toThrow(/current password/i);
    await setPassword(userId, "newpass12", "s3cretpass");
    expect((await login({ identifier: phone, password: "newpass12" })).user.id).toBe(userId);
  });

  it("email login still works via the unified identifier", async () => {
    const email = `id-${Date.now()}@smash.test`;
    const reg = await register({ name: "Id User", email, password: "password123" });
    const byEmail = await login({ identifier: email, password: "password123" });
    expect(byEmail.user.id).toBe(reg.user.id);
    await expect(login({ identifier: email, password: "nope" })).rejects.toThrow(/invalid login/i);
  });

  it("links a verified phone to an existing email account, which can then log in by phone", async () => {
    const email = `otp-${Date.now()}@smash.test`;
    const reg = await register({ name: "Email User", email, password: "password123" });
    const phone = nextPhone();
    await issue(phone, "777777");
    await addVerifiedPhone(reg.user.id, phone, "777777");

    await issue(phone, "888888");
    const loggedIn = await authByPhone({ phone, code: "888888" });
    expect("user" in loggedIn && (loggedIn as { user: { id: string } }).user.id).toBe(reg.user.id);
  });
});
