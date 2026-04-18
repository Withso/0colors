import path from 'path';
import { defineConfig } from 'vitest/config';

const frontendSrc = path.resolve(__dirname, '../packages/frontend/src');
const backendSrc = path.resolve(__dirname, '../packages/backend/src');

const sharedResolve = {
  alias: {
    '@frontend': frontendSrc,
    '@backend': backendSrc,
    '@': frontendSrc,
  },
};

export default defineConfig({
  root: __dirname,
  resolve: sharedResolve,
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
        resolve: sharedResolve,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['projects/**/tests/unit/**/*.unit.test.ts'],
        },
      },
      {
        resolve: sharedResolve,
        test: {
          name: 'domain',
          environment: 'node',
          include: ['projects/**/tests/domain/**/*.domain.test.ts'],
        },
      },
      {
        resolve: sharedResolve,
        test: {
          name: 'integration',
          environment: 'jsdom',
          setupFiles: ['./projects/0colors/tests/helpers/setup-db-tests.ts'],
          include: [
            'projects/**/tests/integration/**/*.integration.test.ts',
            'projects/**/tests/integration/**/*.integration.test.tsx',
          ],
        },
      },
    ],
  },
});
