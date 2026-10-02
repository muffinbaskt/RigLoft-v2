import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Automatically stamps the exact real build time into the app on every
  // single build — no more manually editing a date string by hand.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      // Switched from the default auto-generated service worker to a
      // custom one (src/sw.js), since push notifications need our own
      // "push" and "notificationclick" event handling added in.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
      },
      // "prompt" (not "autoUpdate") — autoUpdate was letting Vite's
      // auto-injected registration script silently apply updates on its
      // own, racing against our custom manual-check button and banner.
      registerType: "prompt",
      includeAssets: ["icon-192.png", "icon-512.png", "icon-512-maskable.png"],
      manifest: {
        name: "Riggy",
        short_name: "Riggy",
        description: "Job site inventory tracker",
        theme_color: "#020617",
        background_color: "#020617",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Vendor code (React, Supabase, icons, the QR library) changes far
        // less often than our own app code and is identical across every
        // deploy that doesn't touch a dependency — splitting it into its
        // own chunk(s) means a normal app-only deploy only invalidates the
        // browser's cache for the small app chunk, not this much bigger,
        // rarely-changing one. Split further by package rather than one
        // single "vendor" blob so, e.g., a lucide-react version bump
        // doesn't also force everyone to re-download Supabase's client.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) {
            return "vendor-react";
          }
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("qrcode")) return "vendor-qrcode";
          return "vendor";
        },
      },
    },
  },
});
