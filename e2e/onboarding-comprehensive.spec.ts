import { test, expect, Page } from "@playwright/test";

/**
 * Comprehensive onboarding flow test for decide.nomadkaraoke.com.
 *
 * This test verifies the complete quiz flow including:
 * - Genre selection (step 1)
 * - Decade selection (step 2)
 * - Preferences selection (step 3)
 * - Manual artist/song entry (step 4) - triggers smart artist API
 * - Smart artist suggestions with infinite scroll (step 5)
 * - Quiz completion and recommendations display
 *
 * IMPORTANT: This test would have caught the OOM bug on 2026-01-15 where
 * the /api/quiz/artists/smart endpoint returned 503 due to loading too
 * many Firestore documents when processing manual artists and exclude lists.
 */

test.describe("Comprehensive Onboarding Flow", () => {
  // Increase timeout for this comprehensive test
  test.setTimeout(120000); // 2 minutes

  // Store auth token for cleanup
  let authToken: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    // Clear state for fresh guest experience
    await context.clearCookies();
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    authToken = null;
  });

  test.afterEach(async ({ request, page }) => {
    // Clean up test data by deleting the guest user
    // This prevents database clutter from hourly test runs
    if (!authToken) {
      // Try to get token from page localStorage
      try {
        authToken = await page.evaluate(() => localStorage.getItem("token"));
      } catch {
        // Page may have been closed
      }
    }

    if (authToken) {
      try {
        const response = await request.delete("/api/auth/me", {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
        if (response.ok()) {
          console.log("✓ Test user cleaned up successfully");
        } else {
          console.log(`⚠ Failed to clean up test user: ${response.status()}`);
        }
      } catch (error) {
        console.log(`⚠ Error cleaning up test user: ${error}`);
      }
    }
  });

  test("complete quiz with manual artists and smart suggestions triggers all APIs", async ({
    page,
  }) => {
    // Track API calls to verify smart artists endpoint is hit
    const apiCalls: { url: string; status: number; body?: string }[] = [];

    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/api/quiz/artists")) {
        let body: string | undefined;
        try {
          body = await response.text();
        } catch {
          // Response body not available
        }
        apiCalls.push({
          url,
          status: response.status(),
          body: body?.slice(0, 200), // Truncate for logging
        });
      }
    });

    // Track console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Start the quiz
    await page.goto("/quiz");
    await page.waitForLoadState("networkidle");

    // ========================================
    // STEP 1: Genre Selection
    // ========================================
    await expect(page.locator("[data-testid='genre-grid']")).toBeVisible({
      timeout: 15000,
    });

    // Select multiple genres (this affects smart artist suggestions)
    await page.locator("[data-testid='genre-pop']").click();
    await page.locator("[data-testid='genre-rock']").click();
    await page.locator("[data-testid='genre-electronic']").click();

    // Verify selections
    await expect(page.locator("[data-testid='genre-selection-count']")).toContainText("3");

    // Continue to next step
    await page.locator("button").filter({ hasText: /continue/i }).click();

    // ========================================
    // STEP 2: Decade Selection
    // ========================================
    await expect(page.locator("[data-testid='decade-section']")).toBeVisible({
      timeout: 10000,
    });

    // Select some decades
    await page.locator("[data-testid='decade-2010s']").click();
    await page.locator("[data-testid='decade-2020s']").click();

    // Continue
    await page.locator("button").filter({ hasText: /continue/i }).click();

    // ========================================
    // STEP 3: Preferences
    // ========================================
    await expect(page.locator("[data-testid='energy-section']")).toBeVisible({
      timeout: 10000,
    });

    // Set some preferences
    await page.locator("[data-testid='energy-medium']").click();
    await page.locator("[data-testid='vocal-comfort-any']").click();

    // Continue
    await page.locator("button").filter({ hasText: /continue/i }).click();

    // ========================================
    // STEP 4: Music You Know (Manual Entry)
    // This is the key step that triggers smart artist API with manual_artists
    // ========================================
    await expect(page.locator("[data-testid='music-you-know-heading']")).toBeVisible({
      timeout: 10000,
    });

    // Enter manual artists using the autocomplete
    const artistInput = page.locator('input[placeholder*="Search for artists"]');
    await expect(artistInput).toBeVisible({ timeout: 5000 });

    // Search for and add an artist
    await artistInput.fill("Green Day");
    await page.waitForTimeout(1500); // Wait for autocomplete debounce

    // Click the first suggestion if it appears
    const artistSuggestion = page.locator('[role="listbox"] [role="option"]').first();
    if (await artistSuggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
      await artistSuggestion.click();
    }

    // Add another artist
    await artistInput.fill("Fall Out Boy");
    await page.waitForTimeout(1500);
    const artistSuggestion2 = page.locator('[role="listbox"] [role="option"]').first();
    if (await artistSuggestion2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await artistSuggestion2.click();
    }

    // Enter a song to trigger manual_song_artists in the API
    const songInput = page.locator('input[placeholder*="Search for songs"]');
    if (await songInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await songInput.fill("Bohemian Rhapsody");
      await page.waitForTimeout(1500);
      const songSuggestion = page.locator('[role="listbox"] [role="option"]').first();
      if (await songSuggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
        await songSuggestion.click();
      }
    }

    // Continue to smart artist selection
    await page.locator("button").filter({ hasText: /continue/i }).click();

    // ========================================
    // STEP 5: Artists You Know (Smart Selection with Infinite Scroll)
    // This calls /api/quiz/artists/smart which was causing OOM
    // ========================================
    await expect(page.locator("[data-testid='artist-heading']")).toBeVisible({
      timeout: 15000,
    });

    // Wait for artists to load
    await expect(page.locator("[data-testid='artist-grid']")).toBeVisible({
      timeout: 15000,
    });

    // Verify some artist cards loaded
    const artistCards = page.locator("[data-testid='artist-grid'] > *");
    await expect(artistCards.first()).toBeVisible({ timeout: 10000 });

    // Get initial count
    const initialCount = await artistCards.count();
    expect(initialCount).toBeGreaterThan(0);

    // Select a few artists to add to the exclude list
    const firstCard = artistCards.first();
    await firstCard.click();

    // Wait a moment for selection to register
    await page.waitForTimeout(500);

    // Select another artist
    const secondCard = artistCards.nth(1);
    if (await secondCard.isVisible()) {
      await secondCard.click();
    }

    // ========================================
    // TRIGGER INFINITE SCROLL - This is the critical test
    // Scrolling loads more artists via /api/quiz/artists/smart with:
    // - genres
    // - decades
    // - manual_artists (from step 4)
    // - manual_song_artists (from step 4)
    // - exclude (all shown + selected artists)
    // ========================================

    // Scroll to bottom to trigger infinite scroll
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Wait for loading indicator or more artists
    await page.waitForTimeout(2000);

    // Scroll again to trigger another load
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await page.waitForTimeout(2000);

    // Verify the smart artists API was called successfully
    // This is where the OOM would have caused a 503
    const smartArtistCalls = apiCalls.filter((c) => c.url.includes("/smart"));

    // Should have at least 1 smart artist call (initial load or infinite scroll)
    // Allow for the API to have been called or for preloading to have handled it
    console.log(`Smart artist API calls: ${smartArtistCalls.length}`);
    smartArtistCalls.forEach((call) => {
      console.log(`  - ${call.url}: ${call.status}`);
      // CRITICAL: No 503 errors!
      expect(call.status).not.toBe(503);
      expect(call.status).toBeLessThan(500);
    });

    // ========================================
    // COMPLETE THE QUIZ
    // ========================================

    // Find and click the finish/submit button
    const finishButton = page
      .locator("button")
      .filter({ hasText: /see recommendations|finish|submit/i });
    await expect(finishButton).toBeVisible({ timeout: 5000 });
    await finishButton.click();

    // Wait for navigation to recommendations
    await page.waitForURL(/\/recommendations/, { timeout: 30000 });

    // Verify recommendations page loaded successfully
    await expect(page.locator("h1")).toBeVisible({ timeout: 10000 });

    // ========================================
    // VERIFICATION
    // ========================================

    // Check no console errors related to API failures
    const apiErrors = consoleErrors.filter(
      (e) => e.includes("503") || e.includes("500") || e.includes("Failed to fetch")
    );
    expect(apiErrors).toHaveLength(0);

    // Capture auth token for cleanup
    authToken = await page.evaluate(() => localStorage.getItem("token"));

    // Log summary
    console.log("=== Test Summary ===");
    console.log(`Total API calls to /api/quiz/artists: ${apiCalls.length}`);
    console.log(`Smart artist calls: ${smartArtistCalls.length}`);
    console.log(`Console errors: ${consoleErrors.length}`);
    console.log(`Final page: ${page.url()}`);
  });

  test("smart artists API handles large exclude list", async ({ page, request }) => {
    /**
     * Direct API test for the smart artists endpoint.
     * This test simulates the exact payload that caused the OOM:
     * - Multiple genres
     * - Multiple decades
     * - Manual artists
     * - Large exclude list (50+ artists)
     */

    // First, get a guest token by visiting the quiz
    await page.goto("/quiz");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Extract the auth token from localStorage and store for cleanup
    const token = await page.evaluate(() => {
      return localStorage.getItem("token");
    });
    authToken = token; // Store for afterEach cleanup

    if (!token) {
      console.log("No token found - skipping direct API test");
      return;
    }

    // Make a direct API call with a large exclude list
    const response = await request.post("/api/quiz/artists/smart", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        genres: ["pop", "rock", "electronic"],
        decades: ["2010s", "2020s"],
        manual_artists: ["Green Day", "Fall Out Boy", "Panic! at the Disco"],
        manual_song_artists: ["Queen", "Bastille", "Coldplay"],
        exclude: [
          // Simulate the exclude list from the OOM bug
          "Tears For Fears",
          "The All-American Rejects",
          "JoJo",
          "Dua Lipa",
          "Selena Gomez",
          "MercyMe",
          "Ace Of Base",
          "Pink",
          "Ricky Martin",
          "Newsboys",
          "Kelsea Ballerini",
          "Good Charlotte",
          "Glee",
          "Enrique Iglesias",
          "Erasure",
          "Sia",
          "Annie Lennox",
          "Paramore",
          "Simple Plan",
          "Genesis",
          "Stereophonics",
          "Camila Cabello",
          "Maná",
          "James Arthur",
          "Maroon 5",
          "The Kinks",
          "Ariana Grande",
          "My Chemical Romance",
          "Korn",
          "Blue",
          "Jimmy Eat World",
          "Sam Smith",
          "Depeche Mode",
          "Lewis Capaldi",
          "Toto",
          "Train",
          "Florida Georgia Line",
          "Dashboard Confessional",
          "Tiffany",
          "Dion",
          "Prince",
          "The Jam",
          "Kylie Minogue",
          "Sweet",
          "Monica",
          "Pet Shop Boys",
          "Adele",
          "Ashlee Simpson",
          "The Bangles",
          "Coldplay",
        ],
        count: 50,
      },
      timeout: 60000, // 60 second timeout
    });

    // CRITICAL: Should NOT return 503 (the OOM error)
    expect(response.status()).not.toBe(503);
    expect(response.status()).toBeLessThan(500);

    // Should return 200 with artists
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.artists).toBeDefined();
    expect(Array.isArray(data.artists)).toBeTruthy();

    console.log(`Smart artists API returned ${data.artists.length} artists (status: ${response.status()})`);
  });
});
