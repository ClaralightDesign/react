import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * Playwright ships its own browser build, but you can point it at one already
 * on the machine instead of downloading ~130MB:
 *
 *   CL_BROWSER_CHANNEL=msedge pnpm test
 *   CL_BROWSER_CHANNEL=chrome  pnpm test
 *
 * Without the variable it uses Playwright's bundled Chromium, which needs
 * `pnpm exec playwright install chromium` once.
 */
const channel = process.env.CL_BROWSER_CHANNEL;

/**
 * Two projects, split by what the test actually needs.
 *
 * `*.spec.ts` is pure logic — class merging in particular — and runs in Node in
 * milliseconds. `*.browser.test.tsx` covers behaviour: focus traps, typeahead,
 * scroll locking and pointer capture are exactly the things jsdom fakes badly
 * and Base UI relies on, so those run in a real engine.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.spec.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.tsx"],
          browser: {
            enabled: true,
            provider: playwright({
              launchOptions: channel ? { channel } : {},
            }),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
