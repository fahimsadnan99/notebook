import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 900 },
  server: {
    proxy: {
      // The free AI text service refuses calls coming from a localhost page ("Missing Turnstile token"),
      // so during `npm run dev` the dev server makes the call instead. The built site calls it directly.
      "/ai-text": {
        target: "https://text.pollinations.ai",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai-text/, ""),
        configure: (proxy) => proxy.on("proxyReq", (req) => { req.removeHeader("origin"); req.removeHeader("referer"); }),
      },
    },
  },
});
