import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  test: {
    environment: "jsdom",
    exclude: ["node_modules", "dist", "tests/e2e/**"],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
