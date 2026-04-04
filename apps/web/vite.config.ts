import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const useDockerPolling = process.env.VITE_DOCKER_POLLING === "true";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: useDockerPolling
      ? {
          usePolling: true,
          interval: 300,
        }
      : undefined,
    hmr: useDockerPolling
      ? {
          host: process.env.VITE_HMR_HOST || "localhost",
          clientPort: Number(process.env.VITE_HMR_CLIENT_PORT || 5173),
        }
      : undefined,
  },
});
