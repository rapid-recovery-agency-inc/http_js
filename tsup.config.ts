import { mkdir, writeFile } from 'node:fs/promises';

import { defineConfig, type Options } from 'tsup';

const external = [
  '@aws-sdk/client-secrets-manager',
  'morgan',
  'pg',
  'winston',
  'winston-transport',
];

const sharedOptions = {
  bundle: true,
  clean: false,
  entry: ['src/index.ts'],
  external,
  platform: 'node',
  sourcemap: true,
  splitting: false,
  target: 'node24',
  tsconfig: 'tsconfig.json',
} satisfies Options;

export default defineConfig([
  {
    ...sharedOptions,
    dts: {
      entry: 'src/index.ts',
    },
    format: ['esm'],
    outDir: 'dist',
  },
  {
    ...sharedOptions,
    format: ['cjs'],
    outDir: 'dist/cjs',
    outExtension() {
      return {
        js: '.js',
      };
    },
    async onSuccess() {
      await mkdir('dist/cjs', { recursive: true });
      await writeFile('dist/cjs/package.json', '{"type":"commonjs"}\n');
    },
  },
]);
