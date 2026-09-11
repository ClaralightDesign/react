#!/usr/bin/env node
/**
 * Built gallery contract and real-browser interaction regressions.
 * Run pnpm build:all first. CL_BROWSER selects Chromium; CL_GALLERY_URL
 * optionally targets an existing gallery instead of an owned random-port preview.
 * The test-only fixture is built into a disposable directory, never docs/dist.
 */
import { runGallery } from "./gallery/runner.mjs";

await runGallery();
