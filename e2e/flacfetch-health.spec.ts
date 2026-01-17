import { test, expect } from "@playwright/test";

/**
 * Production health check tests for flacfetch audio service.
 * These tests verify the deep health endpoint reports all providers are working.
 * Run hourly by GitHub Actions to detect issues quickly.
 */

const FLACFETCH_URL = process.env.FLACFETCH_URL || "http://104.198.214.26:8080";

test.describe("Flacfetch Health Checks", () => {
  test.describe("Deep Health Endpoint", () => {
    test("deep health endpoint responds", async ({ request }) => {
      const response = await request.get(`${FLACFETCH_URL}/health/deep`, {
        timeout: 30000,
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("providers");
      expect(data).toHaveProperty("checked_at");
    });

    test("at least one torrent provider is healthy", async ({ request }) => {
      const response = await request.get(`${FLACFETCH_URL}/health/deep`, {
        timeout: 30000,
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();

      // Check that at least one of RED or OPS is healthy
      const redProvider = data.providers.find(
        (p: { name: string }) => p.name === "RED"
      );
      const opsProvider = data.providers.find(
        (p: { name: string }) => p.name === "OPS"
      );

      const redOk = redProvider?.status === "ok";
      const opsOk = opsProvider?.status === "ok";

      expect(redOk || opsOk).toBeTruthy();
    });

    test("YouTube provider status is checked", async ({ request }) => {
      const response = await request.get(`${FLACFETCH_URL}/health/deep`, {
        timeout: 30000,
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();

      const youtube = data.providers.find(
        (p: { name: string }) => p.name === "YouTube"
      );
      expect(youtube).toBeDefined();
      // YouTube should be configured (ok or degraded), not error/unconfigured
      expect(["ok", "degraded"]).toContain(youtube.status);
    });

    test("overall status is healthy or degraded (not unhealthy)", async ({
      request,
    }) => {
      const response = await request.get(`${FLACFETCH_URL}/health/deep`, {
        timeout: 30000,
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();

      // The overall status should not be "unhealthy" (which means all providers failed)
      expect(["healthy", "degraded"]).toContain(data.status);
    });

    test("healthy count is at least 1", async ({ request }) => {
      const response = await request.get(`${FLACFETCH_URL}/health/deep`, {
        timeout: 30000,
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();

      expect(data.healthy_count).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe("Basic Health Endpoint", () => {
    test("basic health endpoint responds", async ({ request }) => {
      const response = await request.get(`${FLACFETCH_URL}/health`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("transmission");
      expect(data).toHaveProperty("disk");
      expect(data).toHaveProperty("providers");
    });

    test("transmission is available", async ({ request }) => {
      const response = await request.get(`${FLACFETCH_URL}/health`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.transmission.available).toBe(true);
    });

    test("disk space is available", async ({ request }) => {
      const response = await request.get(`${FLACFETCH_URL}/health`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      // Should have at least 1GB free
      expect(data.disk.free_gb).toBeGreaterThan(1);
    });
  });
});
