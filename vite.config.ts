import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  server: {
    host: true, // listen on 0.0.0.0, so the published port reaches it
    port: 5173,
    strictPort: true, // fail instead of moving to 5174, which isn't published
  },
});
