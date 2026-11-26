import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@inttegro/cogni-next",
        replacement: path.resolve(packageDirectory, "../next/src/index.ts"),
      },
    ],
  },
  test: {
    environment: "jsdom",
    restoreMocks: true,
  },
});
