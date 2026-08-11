import { test, expect } from "@playwright/test";

/**
 * Email + password login happy-path. Relies on the seeded ADMIN demo user.
 * Run `npm run db:seed` first (password for all demo users: "password123").
 */
test("email + password login redirects to the dashboard", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email").fill("admin@smash.test");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Log in", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(/Tournaments/)).toBeVisible();
});

test("registration creates an account and signs in", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign up" }).click();

  const email = `e2e_${Date.now()}@smash.test`;
  await page.getByLabel("Full name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
});

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/tournaments");
  await expect(page).toHaveURL(/\/login/);
});
