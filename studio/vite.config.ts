import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  server: {
    watch: { usePolling: true, interval: 250 },
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.FORMA_API_PORT ?? '3001'}`, changeOrigin: false } },
  },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
