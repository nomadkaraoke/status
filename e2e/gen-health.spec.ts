import { test, expect } from "@playwright/test";

/**
 * Production health check tests for gen.nomadkaraoke.com (Karaoke Generator).
 * These tests verify the API and frontend are responding correctly.
 * Run hourly by GitHub Actions to detect issues quickly.
 */

const GEN_FRONTEND_URL = "https://gen.nomadkaraoke.com";
const GEN_API_URL = "https://api.nomadkaraoke.com";

test.describe("Karaoke Gen Health Checks", () => {
  test.describe("API Health", () => {
    test("health endpoint responds", async ({ request }) => {
      const response = await request.get(`${GEN_API_URL}/api/health`, {
        timeout: 30000,
      });
      expect(response.ok()).toBeTruthy();
    });

    test("root endpoint returns service info", async ({ request }) => {
      const response = await request.get(`${GEN_API_URL}/`, {
        timeout: 30000,
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.service).toContain("karaoke-gen");
      expect(data.version).toBeDefined();
    });
  });

  test.describe("Frontend Health", () => {
    test("landing page loads and shows hero", async ({ page }) => {
      await page.goto(GEN_FRONTEND_URL, { timeout: 60000 });
      await page.waitForLoadState("domcontentloaded");

      // Verify hero section loads
      await expect(page.locator("h1")).toBeVisible({ timeout: 30000 });
      await expect(page.locator("h1")).toContainText("Karaoke Video");
    });

    test("pricing section is visible", async ({ page }) => {
      await page.goto(GEN_FRONTEND_URL, { timeout: 60000 });
      await page.waitForLoadState("domcontentloaded");

      // Verify pricing section loads
      await expect(page.locator("#pricing")).toBeVisible({ timeout: 30000 });
    });
  });
});
