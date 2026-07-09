import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
];

const sharedOptions = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  external,
  sourcemap: true,
  logLevel: 'info',
};

await Promise.all([
  // ESM library bundle: src/index.ts → dist/index.js
  build({
    ...sharedOptions,
    entryPoints: ['src/index.ts'],
    format: 'esm',
    outfile: 'dist/index.js',
  }),

  // CJS library bundle: src/index.ts → dist/cjs/index.js
  build({
    ...sharedOptions,
    entryPoints: ['src/index.ts'],
    format: 'cjs',
    outfile: 'dist/cjs/index.js',
  }),

  // CLI bundle: src/cli/setup-environment.ts → dist/cli/setup-environment.js
  build({
    ...sharedOptions,
    entryPoints: ['src/cli/setup-environment.ts'],
    format: 'esm',
    outfile: 'dist/cli/setup-environment.js',
    banner: {
      js: '#!/usr/bin/env node',
    },
  }),
]);

console.log('esbuild bundles complete.');
