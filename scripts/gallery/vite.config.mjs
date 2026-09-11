import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Reuse the docs toolchain without adding another workspace or dependency set.
const require = createRequire(new URL("../../apps/docs/package.json", import.meta.url));
const { default: react } = await import(require.resolve("@vitejs/plugin-react"));
const { default: tailwindcss } = await import(require.resolve("@tailwindcss/vite"));

export default {
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: false,
  plugins: [react(), tailwindcss()],
  build: { rollupOptions: { input: fileURLToPath(new URL("audit.html", import.meta.url)) } },
};
