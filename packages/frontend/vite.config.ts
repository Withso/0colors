import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'build',
  },
  server: {
    port: 3000,
    host: true,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4455',
        changeOrigin: true,
      },
      /** Local QA runner (npm run qa:runner) — same-origin so no CORS vs 127.0.0.1 */
      '/__qa-runner': {
        target: 'http://127.0.0.1:47841',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__qa-runner/, '') || '/',
      },
    },
  },
});