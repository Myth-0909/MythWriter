import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// @ts-expect-error process is a nodejs global
const tauriHost = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const devHost = process.env.VITE_DEV_HOST || tauriHost;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll("\\", "/");
          if (!normalized.includes("/node_modules/")) return undefined;
          if (/\/(?:@handsontable|handsontable|hyperformula)\//.test(normalized)) return "vendor-spreadsheet";
          if (/\/(?:echarts|zrender)\//.test(normalized)) return "vendor-charts";
          if (normalized.includes("/three/")) return "vendor-three";
          if (normalized.includes("/gsap/")) return "vendor-motion";
          if (/\/(?:@tiptap|prosemirror-)/.test(normalized)) return "vendor-editor";
          if (/\/(?:antd|@ant-design)\//.test(normalized)) return "vendor-ant";
          if (normalized.includes("/docx/")) return "vendor-docx";
          return undefined;
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: devHost || false,
    hmr: tauriHost
      ? {
          protocol: "ws",
          host: tauriHost,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
