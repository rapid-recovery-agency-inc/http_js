import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'),
);

const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

const sharedOptions = {
  bundle: true,
  platform: 'node' as const,
  target: 'node24',
  external,
  sourcemap: true,
  logLevel: 'info' as const,
};

await Promise.all([
  // ESM library bundle: src/index.ts → dist/index.js
  build({
    ...sharedOptions,
    entryPoints: ['src/index.ts'],
    format: 'esm' as const,
    outfile: 'dist/index.js',
  }),

  // CJS library bundle: src/index.ts → dist/cjs/index.js
  build({
    ...sharedOptions,
    entryPoints: ['src/index.ts'],
    format: 'cjs' as const,
    outfile: 'dist/cjs/index.js',
  }),

  // CLI bundle: src/cli/setup-environment.ts → dist/cli/setup-environment.js
  build({
    ...sharedOptions,
    entryPoints: ['src/cli/setup-environment.ts'],
    format: 'esm' as const,
    outfile: 'dist/cli/setup-environment.js',
    banner: {
      js: '#!/usr/bin/env node',
    },
  }),
]);

// eslint-disable-next-line no-console -- build tool CLI output
console.log('esbuild bundles complete.');
