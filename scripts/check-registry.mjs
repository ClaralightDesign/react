/**
 * Real copy-in smoke test, not just schema validation. Builds public/r, serves
 * it on loopback, and runs the installed shadcn CLI in an independent Vite app.
 * npm installs consumer dependencies (network/cache required); no workspace
 * symlinks, publishing, or deployment. Set CL_KEEP_REGISTRY_FIXTURE=1 to inspect.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = path.join(root, "node_modules/shadcn/dist/index.js");
const registry = JSON.parse(await readFile(path.join(root, "registry.json"), "utf8"));
const items = registry.items.filter((item) => item.type === "registry:ui");
const base = registry.items.find((item) => item.name === "claralight");
assert(base, "Shared claralight item must exist");
for (const item of items) {
  assert.deepEqual(item.registryDependencies, ["@claralight/claralight"]);
}

async function run(command, args, cwd = root) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      CI: "true",
      NO_COLOR: "1",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_ignore_scripts: "true",
      // Avoid routing loopback registry requests through a developer's proxy.
      NO_PROXY: "localhost,127.0.0.1,::1",
      no_proxy: "localhost,127.0.0.1,::1",
    },
    timeout: 300_000,
  });
  const [code, signal] = await once(child, "exit");
  assert.equal(code, 0, `${command} failed (${signal ?? code})`);
}

await run(process.execPath, [cli, "registry", "validate", "./registry.json"]);
await run(process.execPath, [cli, "build", "registry.json", "--output", "public/r"]);
for (const item of registry.items) {
  const built = JSON.parse(
    await readFile(path.join(root, "public/r", `${item.name}.json`), "utf8"),
  );
  for (const file of built.files ?? []) {
    assert.equal(file.content, await readFile(path.join(root, file.path), "utf8"));
  }
}

const consumer = await mkdtemp(path.join(tmpdir(), "claralight-registry-"));
const requested = new Set();
const server = createServer(async (req, res) => {
  const name = new URL(req.url, "http://localhost").pathname;
  if (!/^\/r\/[a-z0-9-]+\.json$/.test(name)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(path.join(root, "public", name));
    requested.add(name);
    res.writeHead(200, { "Content-Type": "application/json" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});

async function put(name, content) {
  const filename = path.join(consumer, name);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(
    filename,
    typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`,
  );
}

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/r/{name}.json`;
  console.log(`Consumer: ${consumer}\n@claralight: ${url}`);
  // Use the same installed toolchain versions, but install an independent tree.
  const versions = async (names) =>
    Object.fromEntries(
      await Promise.all(
        names.map(async (name) => [
          name,
          JSON.parse(
            await readFile(path.join(root, "apps/docs/node_modules", name, "package.json"), "utf8"),
          ).version,
        ]),
      ),
    );
  await put("package.json", {
    name: "claralight-registry-consumer",
    private: true,
    type: "module",
    scripts: { build: "vite build", typecheck: "tsc --noEmit" },
    dependencies: await versions(["react", "react-dom"]),
    devDependencies: await versions([
      "vite",
      "@tailwindcss/vite",
      "tailwindcss",
      "typescript",
      "@types/react",
      "@types/react-dom",
      "@types/node",
    ]),
  });
  await put("components.json", {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "new-york",
    rsc: false,
    tsx: true,
    tailwind: { config: "", css: "src/styles/app.css", baseColor: "neutral", cssVariables: true },
    aliases: {
      components: "@/components",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
      utils: "@/lib/utils",
    },
    registries: { "@claralight": url },
  });
  await put("tsconfig.json", {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      paths: { "@/*": ["./src/*"] },
      types: ["vite/client", "node"],
    },
    include: ["src", "vite.config.ts"],
  });
  await put(
    "vite.config.ts",
    `import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
`,
  );
  await put(
    "index.html",
    '<html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
  );
  // A nested CSS entry deliberately tests that imports do not assume src/index.css.
  await put("src/styles/app.css", '@import "tailwindcss";\n');
  await put(
    "src/main.tsx",
    `import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogTrigger, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import "./styles/app.css";
createRoot(document.getElementById("root")!).render(
  <Card><Button>Copy-in</Button><Input aria-label="Name" />
    <Dialog><DialogTrigger>Open</DialogTrigger><DialogPopup><DialogTitle>Test</DialogTitle></DialogPopup></Dialog>
    <Select><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="a">A</SelectItem></SelectContent></Select>
    <Popover><PopoverTrigger>Share</PopoverTrigger><PopoverContent side="right"><PopoverTitle>Test</PopoverTitle></PopoverContent></Popover>
    <TooltipProvider><Tooltip><TooltipTrigger>Hover</TooltipTrigger><TooltipContent>Label</TooltipContent></Tooltip></TooltipProvider>
  </Card>
);
`,
  );
  await run("npm", ["install"], consumer);
  const add = (...names) =>
    run(process.execPath, [cli, "add", ...names, "--yes", "--cwd", consumer], consumer);
  // Only request button first: this must fetch the shared dependency itself.
  await add("@claralight/button");
  assert(requested.has("/r/claralight.json"), "CLI did not fetch the shared base");
  for (const file of base.files) {
    const target = file.target.replace("@lib/", "src/lib/");
    assert((await readFile(path.join(consumer, target), "utf8")).length > 0, target);
  }
  // The anchored surface rides with popover/tooltip, so a button-only install
  // must not receive it. This is the whole point of keeping it out of the base.
  for (const target of ["src/lib/anchored.tsx", "src/lib/claralight/anchored.css"]) {
    await assert.rejects(readFile(path.join(consumer, target)), `${target} must not ship alone`);
  }
  await add(
    ...items.filter((item) => item.name !== "button").map((item) => `@claralight/${item.name}`),
  );
  // Repeated add must not duplicate global CSS imports or require manual wiring.
  await add("@claralight/button");
  const css = await readFile(path.join(consumer, "src/styles/app.css"), "utf8");
  let previous = css.indexOf('@import "tailwindcss"');
  assert(previous >= 0, "Tailwind import was removed");
  const copied = async (filename) => {
    const specifier = `@import "@/lib/claralight/${filename}"`;
    // Two items request anchored.css; the CLI must still write one import.
    assert.equal(css.split(specifier).length - 1, 1, `Missing or duplicated ${specifier}`);
    assert.equal(
      await readFile(path.join(consumer, "src/lib/claralight", filename), "utf8"),
      await readFile(path.join(root, "packages/claralight/styles", filename), "utf8"),
    );
    return css.indexOf(specifier);
  };
  for (const filename of ["theme.css", "base.css"]) {
    const at = await copied(filename);
    assert(at > previous, "CSS import order must be Tailwind, theme, base");
    previous = at;
  }
  // The per-component sheets arrive with their items, after the base they extend.
  for (const filename of ["anchored.css", "tooltip.css"]) {
    assert(
      (await copied(filename)) > previous,
      `${filename} must be imported after the shared base`,
    );
  }
  const manifest = JSON.parse(await readFile(path.join(consumer, "package.json"), "utf8"));
  for (const dependency of new Set(registry.items.flatMap((item) => item.dependencies ?? []))) {
    // Registry dependency strings may include a version after a scoped package name.
    const versionAt = dependency.lastIndexOf("@");
    const name = versionAt > 0 ? dependency.slice(0, versionAt) : dependency;
    assert(manifest.dependencies[name], `CLI failed to install ${dependency}`);
    if (versionAt > 0) {
      assert.equal(manifest.dependencies[name], dependency.slice(versionAt + 1));
    }
  }
  assert(
    !manifest.dependencies["@claralight-design/react"],
    "Copy-in must not depend on the npm package",
  );
  for (const item of items) {
    assert(requested.has(`/r/${item.name}.json`), `CLI did not fetch ${item.name}`);
    const source = await readFile(
      path.join(consumer, "src/components/ui", `${item.name}.tsx`),
      "utf8",
    );
    assert(!source.includes("@claralight-design/react"), "Copy-in must use local utilities");
  }
  await run("npm", ["run", "typecheck"], consumer);
  await run("npm", ["run", "build"], consumer);
  const assets = await readdir(path.join(consumer, "dist/assets"));
  const compiledCss = (
    await Promise.all(
      assets
        .filter((name) => name.endsWith(".css"))
        .map((name) => readFile(path.join(consumer, "dist/assets", name), "utf8")),
    )
  ).join("\n");
  for (const marker of [
    "--cl-background",
    ".cl-press",
    ".cl-anchored",
    ".cl-tooltip-positioner",
    ".bg-control",
    ".text-body",
  ]) {
    assert(compiledCss.includes(marker), `Built CSS is missing ${marker}`);
  }
  assert(!compiledCss.includes("@/lib/claralight"), "CSS imports were not bundled");
  assert(!compiledCss.includes("@theme"), "Tailwind did not compile the copied theme");
  console.log(
    `\nRegistry consumption passed: ${items.length} components, shared files, npm dependencies, CSS imports, typecheck, Vite build.`,
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (process.env.CL_KEEP_REGISTRY_FIXTURE === "1") {
    console.log(`Kept consumer fixture: ${consumer}`);
  } else {
    await rm(consumer, { recursive: true, force: true });
  }
}
