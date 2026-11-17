import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { styleTokenQueries } from './src/lib/style-tokens.ts';
export default defineConfig({
  server: {
    watch: { usePolling: true, interval: 250 },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.FORMA_API_PORT ?? '3001'}`,
        changeOrigin: false,
      },
    },
  },
  plugins: [react(), tailwindcss()],
  css: { postcss: { plugins: [styleTokenQueries()] } },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
