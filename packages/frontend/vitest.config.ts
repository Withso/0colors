import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    deps: {
      optimizer: {
        ssr: {
          include: ['@material/material-color-utilities'],
        },
      },
    },
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.unit.test.ts'],
        },
      },
      {
        test: {
          name: 'domain',
          environment: 'node',
          include: ['src/**/*.domain.test.ts'],
        },
      },
      {
        test: {
          name: 'property',
          environment: 'node',
          include: ['src/**/*.property.test.ts'],
        },
      },
      {
        test: {
          name: 'component',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup-component-tests.ts'],
          include: ['src/**/*.component.test.ts', 'src/**/*.component.test.tsx'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup-component-tests.ts'],
          include: ['src/**/*.integration.test.ts', 'src/**/*.integration.test.tsx'],
        },
      },
    ],
  },
});
