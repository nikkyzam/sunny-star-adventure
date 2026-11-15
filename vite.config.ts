import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import gameBuildOutput from "./scripts/build-output"

/** With an AdSense publisher ID set, write the ads.txt that AdSense asks for (see MONETIZATION.md). */
function adsTxt(): Plugin {
  return {
    name: "ads-txt",
    generateBundle() {
      const id = process.env.VITE_ADSENSE_CLIENT;
      if (process.env.VITE_ADS !== "adsense" || !id) return;
      this.emitFile({ type: "asset", fileName: "ads.txt", source: `google.com, ${id.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n` });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), gameBuildOutput(), adsTxt()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
