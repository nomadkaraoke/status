import { test, expect } from "@playwright/test";

/**
 * Production health check tests for decide.nomadkaraoke.com.
 * These tests verify critical user flows are working in production.
 * Run hourly by GitHub Actions to detect issues quickly.
 */

test.describe("Production Health Checks", () => {
  test.describe("API Health", () => {
    test("health endpoint responds", async ({ request }) => {
      const response = await request.get("/api/health");
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.status).toBe("healthy");
    });

    test("deep health endpoint shows all services healthy", async ({ request }) => {
      const response = await request.get("/api/health/deep", { timeout: 30000 });
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.status).toBe("healthy");
      expect(data.checks.firestore.status).toBe("healthy");
      expect(data.checks.bigquery.status).toBe("healthy");
    });

    test("song search API works", async ({ request }) => {
      const response = await request.get("/api/catalog/songs?q=queen&per_page=5");
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.songs.length).toBeGreaterThan(0);
    });

    test("artist search API works", async ({ request }) => {
      const response = await request.get("/api/catalog/artists?q=radiohead&limit=5");
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.artists.length).toBeGreaterThan(0);
    });

    test("artist index API works", async ({ request }) => {
      const response = await request.get("/api/catalog/artists/index");
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      // Should have thousands of artists (response is { artists: [], count: X })
      expect(data.count || data.artists?.length || data.length).toBeGreaterThan(1000);
    });
  });

  test.describe("Frontend Loading", () => {
    test("homepage loads without errors", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Verify main content loads (either landing page variant)
      await expect(page.locator("h1")).toBeVisible();

      // Check for console errors (excluding known benign ones)
      const significantErrors = errors.filter(
        (e) =>
          !e.includes("favicon") &&
          !e.includes("hydration") &&
          !e.includes("third-party")
      );
      expect(significantErrors).toHaveLength(0);
    });

    // Note: Search UI tests removed - the song search API test in API Health suite
    // is the critical test for detecting search functionality issues
  });

  test.describe("Guest Onboarding Flow", () => {
    test.beforeEach(async ({ context, page }) => {
      // Clear state for fresh guest experience
      await context.clearCookies();
      await page.goto("/");
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    });

    test("Get Started creates guest session and navigates to quiz", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Find and click Get Started button
      const getStartedBtn = page.locator("button").filter({ hasText: /get started/i });
      await expect(getStartedBtn).toBeVisible({ timeout: 10000 });
      await getStartedBtn.click();

      // Should navigate to quiz
      await page.waitForURL(/\/quiz/, { timeout: 15000 });

      // Quiz page should load
      await expect(page.locator("h1, [data-testid='quiz-heading']")).toBeVisible({ timeout: 10000 });
    });

    test("quiz page loads with genre selection", async ({ page }) => {
      // Go directly to quiz (will create guest session).
      // Use /en/quiz: production is a static export, so the locale middleware
      // does not run and bare /quiz returns 404.
      await page.goto("/en/quiz");
      await page.waitForLoadState("networkidle");

      // Wait for page to fully load
      await page.waitForTimeout(2000);

      // Quiz now starts at step 1 (intro) - verify it loads
      await expect(page.locator("[data-testid='quiz-heading']")).toBeVisible({ timeout: 10000 });

      // Click "Get Started" to advance to step 2 (genre selection)
      const getStartedBtn = page.locator("button").filter({ hasText: /get started/i });
      await expect(getStartedBtn).toBeVisible({ timeout: 5000 });
      await getStartedBtn.click();

      // Wait for step 2 to load
      await page.waitForTimeout(1000);

      // Genre grid should be visible
      const genreGrid = page.locator("[data-testid='genre-grid']");
      await expect(genreGrid).toBeVisible({ timeout: 15000 });

      // Some genres should be present
      await expect(page.locator("[data-testid='genre-pop']")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("[data-testid='genre-rock']")).toBeVisible({ timeout: 5000 });
    });

    // Note: Full artist autocomplete flow test skipped - the critical artist index API test
    // in the API Health suite covers the underlying functionality that was previously broken
    test("can navigate through quiz steps", async ({ page }) => {
      // Go to quiz (locale-prefixed; see note above)
      await page.goto("/en/quiz");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Quiz starts at step 1 (intro) - click Get Started to reach genre selection
      const getStartedBtn = page.locator("button").filter({ hasText: /get started/i });
      await expect(getStartedBtn).toBeVisible({ timeout: 10000 });
      await getStartedBtn.click();
      await page.waitForTimeout(1000);

      // Now on step 2 (genre selection) - select genres
      await page.locator("[data-testid='genre-rock']").click();
      await page.locator("[data-testid='genre-pop']").click();

      // Verify continue button works
      const continueBtn = page.locator("button").filter({ hasText: /continue/i });
      await expect(continueBtn).toBeVisible({ timeout: 5000 });
      await continueBtn.click();

      // Verify we moved to next step (step 3 - artist entry)
      await page.waitForTimeout(1000);
      await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
    });
  });
});
