import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
  },
  {
    entry: ["src/client.ts"],
    format: ["esm"],
    dts: true,
    clean: false,
    external: ["astro:prefetch"],
  },
]);
