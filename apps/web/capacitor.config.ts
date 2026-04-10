import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pangofold.app",
  appName: "Pangofold",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
