import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

import { DotEnvPath } from './types';

type DotEnvLoaderOptions = {
  path?: DotEnvPath;
  override?: boolean;
  processEnv?: NodeJS.ProcessEnv;
  cwd?: string;
};

const DEFAULT_DOTENV_PATHS = [
  '.env',
  '.env.development',
  '.env.local',
] as const;

function normalizeDotEnvPaths(dotEnvPath?: DotEnvPath): string[] {
  if (!dotEnvPath) {
    return [...DEFAULT_DOTENV_PATHS];
  }

  return Array.isArray(dotEnvPath) ? dotEnvPath : [dotEnvPath];
}

export function loadDotEnvFilesSync(options: DotEnvLoaderOptions = {}): void {
  const dotEnvPaths = normalizeDotEnvPaths(options.path);
  const mergedDotEnvValues: Record<string, string> = {};
  const targetEnv = options.processEnv ?? process.env;
  const cwd = options.cwd ?? process.cwd();

  for (const dotEnvPath of dotEnvPaths) {
    const absolutePath = path.isAbsolute(dotEnvPath)
      ? dotEnvPath
      : path.resolve(cwd, dotEnvPath);

    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const fileContents = fs.readFileSync(absolutePath, 'utf8');
    Object.assign(mergedDotEnvValues, dotenv.parse(fileContents));
  }

  for (const [key, value] of Object.entries(mergedDotEnvValues)) {
    if (options.override || targetEnv[key] === undefined) {
      targetEnv[key] = value;
    }
  }
}
