import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The white dashboard is served under /white now that the purple one holds the root, so
  // its asset URLs need that prefix. Env-driven rather than hardcoded so `npm run dev` is
  // untouched and still serves from / — only the production build takes the prefix.
  //
  // Takes a BARE name (`NPN_BASE=white`), not a path. Git Bash on Windows rewrites any
  // value that looks like an absolute path, so `NPN_BASE=/white/` silently becomes
  // `/Program Files/Git/white/` and the build ships dead asset URLs.
  base: process.env.NPN_BASE ? `/${process.env.NPN_BASE.replace(/^\/+|\/+$/g, "")}/` : "/",
  server: {
    // Dev only. On demo day the FastAPI process serves dist/ and this proxy is unused,
    // so the app is same-origin and there is no CORS surface at all.
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
