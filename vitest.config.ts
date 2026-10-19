import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The server error page inlines the theme from styles.css?raw; load it instead of an empty stub.
    css: { include: [/styles\.css/] },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
