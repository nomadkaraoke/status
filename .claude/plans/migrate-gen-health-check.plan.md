# Plan: Migrate Karaoke Gen E2E Prod Health Check to Status Repo

**Created:** 2026-01-19
**Branch:** feat/sess-20260119-1759-migrate-e2e-health-check
**Status:** Complete

## Overview

Move the karaoke-gen production API health check tests from the karaoke-gen repo to the centralized status repo. This consolidates all production health monitoring in one place.

## Current State Analysis

### Status Repo Structure
The status repo already has:
- `e2e/health-check.spec.ts` - Karaoke Decide health checks (API + onboarding)
- `e2e/flacfetch-health.spec.ts` - FlacFetch audio service health checks
- `.github/workflows/decide-health.yml` - Hourly Decide health check workflow
- `.github/workflows/flacfetch-health.yml` - Hourly FlacFetch health check workflow
- `index.html` - Status page that shows all 3 services (Decide, FlacFetch, Gen)

### Karaoke-Gen Current Setup
The karaoke-gen repo has:
- `frontend/e2e/production/full-user-journey.spec.ts` - Contains "Production E2E - API Health" tests (lines 597-609)
- `frontend/e2e/production/happy-path-real-user.spec.ts` - Full journey test run daily via `e2e-happy-path.yml`
- `.github/workflows/e2e-happy-path.yml` - Daily full journey test (expensive, 60 min)

### Status Page Observation
The `index.html` already shows a "Gen" card that pulls from `karaoke-gen` repo's `e2e-happy-path.yml` workflow. This is the daily full journey test - NOT a lightweight health check.

## Requirements

- [ ] Create lightweight health check for gen.nomadkaraoke.com API (similar to decide health check)
- [ ] Create GitHub Actions workflow to run hourly
- [ ] Maintain consistency with existing health check patterns
- [ ] Update status page to use the new workflow (currently points to wrong workflow)
- [ ] Keep the heavy `e2e-happy-path.yml` running daily in karaoke-gen repo (don't migrate that)

## Technical Approach

### What to Create
1. **New test file**: `e2e/gen-health.spec.ts` - Lightweight API health checks for karaoke-gen
   - Health endpoint check (`/api/health`)
   - Root endpoint check (`/`)
   - Frontend loads without errors

2. **New workflow**: `.github/workflows/gen-health.yml` - Hourly health check
   - Mirror structure of `decide-health.yml`
   - Run at :30 (offset from decide at :15)
   - Send email notification on failure

### What NOT to Migrate
- The full user journey test (`happy-path-real-user.spec.ts`) - too expensive for hourly runs
- The email testing helpers - not needed for lightweight health check

### Status Page Changes
- Add new workflow config for gen hourly health check
- Rename "Automated Tests" section to "Hourly Checks"
- Add new "Automated End to End Tests" section at bottom for daily comprehensive tests
- Show BOTH: hourly health check (in Hourly Checks) AND daily happy path (in E2E Tests)

## Implementation Steps

1. [x] Create `e2e/gen-health.spec.ts` with lightweight API health checks
   - Health endpoint responds with 200
   - Root endpoint returns karaoke-gen service info
   - Frontend loads and shows hero section

2. [x] Create `.github/workflows/gen-health.yml` workflow
   - Run on schedule (hourly at :30)
   - Run on workflow_dispatch
   - Install dependencies and Playwright
   - Run health check tests
   - Email notification on failure
   - Fail workflow if tests fail

3. [x] Update `index.html` status page structure
   - Rename "Automated Tests" section to "Hourly Checks"
   - Replace existing Gen card workflow from `e2e-happy-path.yml` to `gen-health.yml`
   - Update Gen card description from "Daily generation test" to "Hourly health checks"
   - Add new "Automated End to End Tests" section at bottom
   - Add Gen daily happy path card in new E2E section (uses existing `e2e-happy-path.yml`)

4. [x] Add "Karaoke Gen - Live Checks" section to status page
   - API Health check
   - Frontend check
   - (Keep it simple - match pattern of other sections)

5. [x] Test locally
   - Run `npx playwright test e2e/gen-health.spec.ts`
   - Verify tests pass against production (23 tests pass)

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `e2e/gen-health.spec.ts` | Create | Lightweight API health checks |
| `.github/workflows/gen-health.yml` | Create | Hourly health check workflow |
| `index.html` | Modify | Update workflow reference and add live checks |

## Testing Strategy

- **Local test**: Run `npm test e2e/gen-health.spec.ts` against production
- **Workflow test**: Manually trigger workflow via GitHub Actions
- **Verify status page**: Load status.nomadkaraoke.com after deploy

## Open Questions

None - the pattern is well-established by the existing health checks.

## Rollback Plan

If issues occur:
1. Revert `index.html` changes to point back to `e2e-happy-path.yml`
2. Delete or disable the new workflow file
3. The new test file can remain (unused) or be deleted

## Notes

The existing status page already has UI placeholders for the Gen service, just pointing to the wrong workflow. The migration is mostly about creating the lightweight health check tests and workflow, then updating the config reference.
