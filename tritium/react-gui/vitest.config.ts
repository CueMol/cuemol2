import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/renderer/__test__/**/*.test.{ts,tsx}"],
    globals: false,
  },
});
