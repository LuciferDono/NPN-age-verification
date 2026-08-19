import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Purple is the default dashboard and holds the root path, so no base prefix.
  server: {
    // 5174, not 5173: the white dashboard's dev server owns 5173 and both may run at once.
    port: 5174,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
