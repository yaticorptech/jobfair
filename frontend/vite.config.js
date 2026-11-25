import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  server: { port: 5170, strictPort: true, proxy: { '/api': 'http://localhost:8170' } },
  build: { outDir: path.join(root, 'dist'), emptyOutDir: true },
});
