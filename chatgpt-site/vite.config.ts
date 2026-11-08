import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev:local` serves the built Worker on 8787. The proxy only applies to `vite` itself.
export default defineConfig({
  plugins: [react()],
  build: { outDir: '.build/client', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
