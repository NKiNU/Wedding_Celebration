import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Runs scripts/export-golden.ts only, same aliases as vitest.config.ts. `npm run golden`.
export default defineConfig({
  resolve: {
    alias: {
      "@": src("../src"),
      "server-only": src("../tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/export-golden.ts"],
  },
});
