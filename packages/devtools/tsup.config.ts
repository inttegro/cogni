import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/react.tsx"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  loader: { ".woff2": "dataurl" },
  noExternal: ["@fontsource-variable/inter"],
  external: ["react", "react/jsx-runtime", "@inttegro/cogni-react"],
});
