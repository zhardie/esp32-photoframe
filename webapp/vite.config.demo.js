import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";
import { resolve } from "path";

// Demo build config - outputs to demo folder for GitHub Pages
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  base: "/esp32-photoframe/",
  publicDir: resolve(__dirname, "../demo"), // Serve demo folder as public (for sample.jpg, manifests)
  build: {
    outDir: resolve(__dirname, "../demo"),
    emptyOutDir: false, // Don't delete existing demo files (manifests, sample.jpg, etc.)
    rollupOptions: {
      input: {
        demo: resolve(__dirname, "index.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  server: {
    open: "/esp32-photoframe/index.html",
  },
});
