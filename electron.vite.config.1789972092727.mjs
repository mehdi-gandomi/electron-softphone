// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var __electron_vite_injected_dirname = "C:\\Users\\Mehdi\\Desktop\\softphone";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    envPrefix: ["VITE_", "MAIN_VITE_"],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/main/index.ts")
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    envPrefix: ["VITE_", "PRELOAD_VITE_"]
  },
  renderer: {
    root: resolve(__electron_vite_injected_dirname, "src/renderer"),
    envPrefix: ["VITE_", "RENDERER_VITE_"],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/renderer/index.html")
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src/renderer")
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
