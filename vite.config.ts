import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import manifest from "./package.json";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(manifest.version) },
  plugins: [react(), tailwindcss()],
  server: { port: 1420, strictPort: true },
  test: { include: ["tests/**/*.test.ts"] },
});
