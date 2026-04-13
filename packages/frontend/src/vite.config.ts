import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  esbuild: {
    // In production: strip console.log and console.warn (keep console.error for real errors)
    ...(mode === 'production' && {
      pure: ['console.log', 'console.warn'],
    }),
  },
}));
