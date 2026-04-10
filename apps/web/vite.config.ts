import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [],
      manifest: {
        name: "Pangofold",
        short_name: "Pangofold",
        description: "Trip companion — plan, log, wrap",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        display: "standalone",
        scope: "/",
        start_url: "/",
      },
    }),
  ],
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
