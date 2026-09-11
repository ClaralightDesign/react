import { defineConfig } from "vitest/config";

// DOM behavior and CSS integration are tested against built output by check:gallery.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
