import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = resolve(__dirname, '..', 'dist');

interface BundleExports {
  createEnvironment: unknown;
  createLogger: unknown;
  InMemoryCache: unknown;
  hmacMiddleware: unknown;
  createPrismaClients: unknown;
  rateLimiterMiddleware: unknown;
  databaseRequestLoggerMiddleware: unknown;
  fetchAwsSecret: unknown;
}

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    // eslint-disable-next-line no-console -- CLI smoke test output
    console.log(`  PASS  ${message}`);
  } else {
    // eslint-disable-next-line no-console -- CLI smoke test output
    console.error(`  FAIL  ${message}`);
    failures++;
  }
}

// ── ESM bundle ──────────────────────────────────────────────────────────────

// eslint-disable-next-line no-console -- CLI smoke test section header
console.log('ESM bundle (dist/index.js)');

const esmBundle = (await import(resolve(distDir, 'index.js'))) as BundleExports;

// Value exports
assert(
  typeof esmBundle.createEnvironment === 'function',
  'createEnvironment is exported',
);
assert(
  typeof esmBundle.createLogger === 'function',
  'createLogger is exported',
);
assert(
  typeof esmBundle.InMemoryCache === 'function',
  'InMemoryCache is exported',
);
assert(
  typeof esmBundle.hmacMiddleware === 'function',
  'hmacMiddleware is exported',
);
assert(
  typeof esmBundle.createPrismaClients === 'function',
  'createPrismaClients is exported',
);
assert(
  typeof esmBundle.rateLimiterMiddleware === 'function',
  'rateLimiterMiddleware is exported',
);
assert(
  typeof esmBundle.databaseRequestLoggerMiddleware === 'function',
  'databaseRequestLoggerMiddleware is exported',
);
assert(
  typeof esmBundle.fetchAwsSecret === 'function',
  'fetchAwsSecret is exported',
);

// No relative imports — everything should be inlined by esbuild
const esmContent = readFileSync(resolve(distDir, 'index.js'), 'utf8');
const relativeImport = /from\s+["']\.\.?\//;
assert(
  !relativeImport.test(esmContent),
  'No relative imports (bundle should be fully inlined)',
);

// ── CJS bundle ──────────────────────────────────────────────────────────────

// eslint-disable-next-line no-console -- CLI smoke test section header
console.log('\nCJS bundle (dist/cjs/index.js)');

const require_ = createRequire(import.meta.url);
const cjsBundle = require_(resolve(distDir, 'cjs/index.js')) as BundleExports;

assert(
  typeof cjsBundle.createEnvironment === 'function',
  'createEnvironment is exported',
);
assert(
  typeof cjsBundle.createLogger === 'function',
  'createLogger is exported',
);
assert(
  typeof cjsBundle.InMemoryCache === 'function',
  'InMemoryCache is exported',
);
assert(
  typeof cjsBundle.hmacMiddleware === 'function',
  'hmacMiddleware is exported',
);
assert(
  typeof cjsBundle.createPrismaClients === 'function',
  'createPrismaClients is exported',
);

// CJS should not have ESM import/export statements (comments excluded)
const cjsContent = readFileSync(resolve(distDir, 'cjs/index.js'), 'utf8');
const cjsStatements = cjsContent
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'));
assert(
  !/\bimport\s+\{/.test(cjsStatements.join('\n')),
  'No ESM import statements in CJS bundle',
);
assert(
  !/\bexport\s+\{/.test(cjsStatements.join('\n')),
  'No ESM export statements in CJS bundle',
);

// ── CLI bundle ──────────────────────────────────────────────────────────────

// eslint-disable-next-line no-console -- CLI smoke test section header
console.log('\nCLI bundle (dist/cli/setup-environment.js)');

const cliContent = readFileSync(
  resolve(distDir, 'cli/setup-environment.js'),
  'utf8',
);
assert(
  cliContent.startsWith('#!/usr/bin/env node'),
  'CLI bundle starts with shebang',
);

const cliRelativeImport = /from\s+["']\.\.?\//;
assert(
  !cliRelativeImport.test(cliContent),
  'No relative imports in CLI bundle',
);

// ── CJS package.json ────────────────────────────────────────────────────────

// eslint-disable-next-line no-console -- CLI smoke test section header
console.log('\nCJS package.json');

const cjsPkg = JSON.parse(
  readFileSync(resolve(distDir, 'cjs/package.json'), 'utf8'),
) as { type: string };
assert(cjsPkg.type === 'commonjs', 'type is "commonjs"');

// ── Summary ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-console -- CLI smoke test summary output
console.log(
  `\n${failures === 0 ? 'All smoke tests passed!' : `${failures} smoke test(s) failed`}`,
);
process.exit(failures > 0 ? 1 : 0);
