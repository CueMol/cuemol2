import { defineConfig } from "vitest/config";

export default defineConfig({
  // Developer-only UI flag, mirroring electron.vite.config.ts. Tests always
  // run with the dev UI present; the release-build behaviour is covered by
  // passing the flag explicitly to the gated builders.
  define: {
    __DEV_UI__: "true",
  },
  test: {
    environment: "jsdom",
    include: ["src/renderer/__test__/**/*.test.{ts,tsx}"],
    globals: false,
  },
});
