import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The gallery consumes `@claralight-design/react` exactly the way a real project does:
 * through `package.json#exports`, resolving to the built `dist/`.
 *
 * That is deliberate. Aliasing to `src/` would give faster hot reload, but it
 * would also mean the gallery renders from a tree nobody else loads — so a
 * broken `exports` map, a missing `@source`, or a d.ts that does not match the
 * runtime would all stay invisible until a consumer hit them. Rebuilds are
 * `tsdown --watch`, which is about 120ms.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
