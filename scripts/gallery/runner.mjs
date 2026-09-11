import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { readTokens, resolveToken } from "../lib/tokens.mjs";
import { createAssertions } from "./assertions.mjs";
import { checkGallery } from "./contracts.mjs";
import { checkInteractions } from "./interactions.mjs";

/** Built public docs + separately built disposable regression fixture. */
export async function runGallery() {
  const assert = createAssertions();
  const require = createRequire(new URL("../../apps/docs/package.json", import.meta.url));
  const { build, preview } = await import(require.resolve("vite"));
  const candidates = [
    process.env.CL_BROWSER,
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const executablePath = candidates.find(existsSync);
  let browser;
  let fixtureDirectory;
  const servers = [];
  const startPreview = async (config) => {
    const server = await preview({
      ...config,
      logLevel: "error",
      preview: { host: "127.0.0.1", port: 0, open: false },
    });
    servers.push(server);
    return `http://127.0.0.1:${server.httpServer.address().port}`;
  };
  try {
    if (!executablePath)
      throw new Error(
        `No Chromium browser found. Set CL_BROWSER. Tried:\n${candidates.join("\n")}`,
      );
    const source = readTokens();
    const tokens = Object.fromEntries(
      ["dark", "light"].map((scheme) => [
        scheme,
        Object.fromEntries(
          Object.keys({ ...source.shared, ...source.schemes[scheme] }).map((name) => [
            name,
            resolveToken(source, name, scheme),
          ]),
        ),
      ]),
    );
    const docsRoot = fileURLToPath(new URL("../../apps/docs/", import.meta.url));
    if (!process.env.CL_GALLERY_URL && !existsSync(join(docsRoot, "dist/index.html"))) {
      throw new Error("Built docs missing. Run pnpm build:all before check-gallery.");
    }
    const galleryUrl =
      process.env.CL_GALLERY_URL ?? (await startPreview({ root: docsRoot, configFile: false }));
    fixtureDirectory = await mkdtemp(join(tmpdir(), "claralight-gallery-"));
    const fixtureConfig = fileURLToPath(new URL("vite.config.mjs", import.meta.url));
    // This isolated entry is never copied into apps/docs/dist or the package.
    await build({
      configFile: fixtureConfig,
      logLevel: "error",
      build: { outDir: fixtureDirectory, emptyOutDir: true },
    });
    const fixtureUrl = await startPreview({
      configFile: false,
      root: docsRoot,
      build: { outDir: fixtureDirectory },
    });
    console.log(`Gallery: ${galleryUrl}\nRegression fixture: ${fixtureUrl}/audit.html`);
    browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`));
    const context = { ...assert, page, tokens, errors };
    await checkGallery({ ...context, url: galleryUrl.replace(/\/$/, "") });
    await checkInteractions({ ...context, url: fixtureUrl });
    assert.ok(
      "no browser console or uncaught errors across all pages",
      errors.length === 0,
      errors.join(" | "),
    );
  } catch (error) {
    assert.fail(error);
  } finally {
    // Closing one resource must not prevent cleanup of the others on failure.
    try {
      await browser?.close();
    } catch (error) {
      assert.fail(error);
    }
    for (const server of servers.reverse()) {
      try {
        await new Promise((resolve, reject) => {
          server.httpServer.close((error) => (error ? reject(error) : resolve()));
          server.httpServer.closeAllConnections();
        });
      } catch (error) {
        assert.fail(error);
      }
    }
    if (fixtureDirectory) {
      try {
        await rm(fixtureDirectory, { recursive: true, force: true });
      } catch (error) {
        assert.fail(error);
      }
    }
  }
  process.exitCode = assert.finish();
}
