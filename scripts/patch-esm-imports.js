import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');

const hasKnownExtension = (specifier) =>
  /\.(js|mjs|cjs|json|node)$/.test(specifier);

const resolveSpec = (specifier, importerDir) => {
  // Resolve the specifier to an absolute path and check whether it needs
  // an /index.js suffix (directory import) or just .js (file import).
  const candidate = path.resolve(importerDir, `${specifier}.js`);

  // It's a real file — no special handling needed.
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return `${specifier}.js`;
  }

  // It's a directory with an index.js — Node ESM requires the explicit path.
  const indexCandidate = path.resolve(importerDir, specifier, 'index.js');
  if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
    return `${specifier}/index.js`;
  }

  // Fallback: append .js even if we can't verify (best-effort).
  return `${specifier}.js`;
};

const patchSpec = (specifier, importerDir) => {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return specifier;
  }

  if (hasKnownExtension(specifier)) {
    return specifier;
  }

  return resolveSpec(specifier, importerDir);
};

const patchFile = (filePath) => {
  const dir = path.dirname(filePath);
  const original = fs.readFileSync(filePath, 'utf8');
  let patched = original.replace(
    /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
    (_, prefix, specifier, suffix) =>
      `${prefix}${patchSpec(specifier, dir)}${suffix}`,
  );

  patched = patched.replace(
    /(import\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/g,
    (_, prefix, specifier, suffix) =>
      `${prefix}${patchSpec(specifier, dir)}${suffix}`,
  );

  patched = patched.replace(
    /(import\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
    (_, prefix, specifier, suffix) =>
      `${prefix}${patchSpec(specifier, dir)}${suffix}`,
  );

  if (patched !== original) {
    fs.writeFileSync(filePath, patched, 'utf8');
  }
};

const walk = (dirPath) => {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);

    // Skip the CJS output tree — CJS require() resolves extensionless paths natively.
    if (entry.isDirectory() && entry.name === 'cjs' && dirPath === root) {
      continue;
    }

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.js')) {
      patchFile(fullPath);
    }
  }
};

if (!fs.existsSync(root)) {
  // eslint-disable-next-line no-console
  console.error(`dist/ directory not found at ${root}`);
  process.exit(1);
}

walk(root);
// eslint-disable-next-line no-console
console.log('ESM import extensions patched.');
