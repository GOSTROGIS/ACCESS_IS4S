import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dashboard server sends a strict CSP (script-src/style-src 'self'), so the
// build must not inline scripts or styles: no modulepreload polyfill, CSS in files.
export default defineConfig({
  plugins: [react()],
  build: {
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    sourcemap: false,
  },
});
