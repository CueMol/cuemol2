import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Developer-only UI flag, mirroring electron.vite.config.ts. Tests always
  // run with the dev UI present; the release-build behaviour is covered by
  // passing the flag explicitly to the gated builders.
  define: {
    __DEV_UI__: "true",
  },
  // Mirrors the `paths` maps of tsconfig.web.json / tsconfig.node.json and the
  // `resolve.alias` maps of electron.vite.config.ts. Declared explicitly (not
  // via vite-tsconfig-paths) so a test resolves an alias the same way the
  // production bundle does, regardless of which tsconfig project owns the file
  // under test.
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src/renderer"),
      "@shared": resolve(__dirname, "src/shared"),
      "@main": resolve(__dirname, "src/main"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/renderer/__test__/**/*.test.{ts,tsx}"],
    globals: false,
  },
});
