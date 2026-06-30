#!/usr/bin/env node

import { spawn as spawnChildProcess } from 'node:child_process';
import { mkdir, writeFile as writeFileToDisk } from 'node:fs/promises';
import { dirname } from 'node:path';

import { loadDotEnvFilesSync } from '../modules/environment/dotenv-loader';
import { fetchAwsSecret } from '../shared/utils/aws/services';

type CliCommand = {
  command: string;
  args: string[];
};

export type ParsedSetupEnvArgs = {
  showHelp: boolean;
  secretNames?: string[];
  writeTo?: string;
  cliCommand?: CliCommand;
  error?: string;
};

export type SetupEnvChildProcess = {
  pid?: number | undefined;
  kill(signal?: NodeJS.Signals): boolean;
  on(event: 'error', listener: (error: Error) => void): SetupEnvChildProcess;
  on(
    event: 'close',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): SetupEnvChildProcess;
};

export type SetupEnvSpawnOptions = {
  env: NodeJS.ProcessEnv;
  stdio: 'inherit';
  detached: boolean;
};

export type SetupEnvSpawn = (
  command: string,
  args: string[],
  options: SetupEnvSpawnOptions,
) => SetupEnvChildProcess;

type Writable = {
  write: (chunk: string) => unknown;
};

type SignalListener = () => void;

type SecretNamesSource = 'SECRET_NAMES' | 'SECRET_NAME' | 'cli';

type ResolvedSecretNames = {
  names: string[];
  source?: SecretNamesSource | undefined;
};

type SetupEnvRuntime = {
  env: NodeJS.ProcessEnv;
  fetchSecrets: (secretName: string) => Promise<unknown>;
  spawn: SetupEnvSpawn;
  writeFile: (path: string, content: string) => Promise<void>;
  stdout: Writable;
  stderr: Writable;
  propagateSignal: (signal: NodeJS.Signals) => void;
  addSignalListener: (signal: NodeJS.Signals, listener: SignalListener) => void;
  removeSignalListener: (
    signal: NodeJS.Signals,
    listener: SignalListener,
  ) => void;
  killProcessGroup: (pid: number, signal: NodeJS.Signals) => void;
  useProcessGroup: boolean;
};

const usageText = [
  'Usage:',
  '  setup-environment [--secret-name <name> | --secret-names <name1,name2>] [--write-to <path>] [--] <command> [args...]',
  '',
  'Options:',
  '  --secret-name <name>  AWS Secrets Manager secret name or ARN.',
  '  --secret-names <list> Comma-separated AWS secret names or ARNs.',
  '  --write-to <path>     Write fetched secrets to an env file and skip command execution.',
  '                        SECRET_NAMES or SECRET_NAME from process.env take precedence over CLI flags.',
  '  -h, --help            Show this message.',
  '',
  'Examples:',
  '  setup-environment -- next start',
  '  setup-environment --secret-name prod/my-app -- node server.js',
  '  setup-environment --secret-names prod/base,prod/web -- node server.js',
  '  setup-environment --secret-names prod/base,prod/web --write-to .env.production',
].join('\n');

const defaultRuntime: SetupEnvRuntime = {
  env: process.env,
  fetchSecrets: (secretName) =>
    fetchAwsSecret(secretName, process.env.AWS_REGION || 'us-east-1'),
  spawn: (command, args, options) => spawnChildProcess(command, args, options),
  writeFile: async (path, content) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFileToDisk(path, content, 'utf8');
  },
  stdout: process.stdout,
  stderr: process.stderr,
  propagateSignal: (signal) => {
    process.kill(process.pid, signal);
  },
  addSignalListener: (signal, listener) => {
    process.on(signal, listener);
  },
  removeSignalListener: (signal, listener) => {
    process.off(signal, listener);
  },
  killProcessGroup: (pid, signal) => {
    process.kill(-pid, signal);
  },
  useProcessGroup: process.platform !== 'win32',
};

const signalsToForward: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

if (process.platform !== 'win32') {
  signalsToForward.push('SIGQUIT');
}

function writeLine(writable: Writable, message: string): void {
  writable.write(`${message}\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createCliError(message: string): string {
  return `[setup-environment] ${message}`;
}

function parseSecretNames(value: string): string[] {
  return value
    .split(',')
    .map((secretName) => secretName.trim())
    .filter((secretName) => secretName.length > 0);
}

function resolveSecretNames(
  parsedSecretNames: string[] | undefined,
  env: NodeJS.ProcessEnv,
): ResolvedSecretNames {
  const envSecretNames = parseSecretNames(env.SECRET_NAMES ?? '');
  if (envSecretNames.length > 0) {
    return {
      names: envSecretNames,
      source: 'SECRET_NAMES',
    };
  }

  const envSecretName = parseSecretNames(env.SECRET_NAME ?? '');
  if (envSecretName.length > 0) {
    return {
      names: envSecretName,
      source: 'SECRET_NAME',
    };
  }

  return {
    names: parsedSecretNames ?? [],
    source: parsedSecretNames === undefined ? undefined : 'cli',
  };
}

function serializeSecretsAsEnvFile(secrets: Record<string, string>): string {
  const lines = Object.entries(secrets).map(
    ([key, value]) => `${key}=${formatEnvValue(value)}`,
  );
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

function formatEnvValue(value: string): string {
  if (value.length === 0) {
    return '""';
  }

  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function parseFlagValue(
  argv: string[],
  index: number,
  flagName: string,
): { value?: string | undefined; nextIndex: number } {
  const token = argv[index];
  if (token === undefined) {
    return { value: undefined, nextIndex: index + 1 };
  }
  const directMatch = `${flagName}=`;
  if (token.startsWith(directMatch)) {
    const inlineValue = token.slice(directMatch.length);
    return {
      value: inlineValue,
      nextIndex: index + 1,
    };
  }

  const nextValue = argv[index + 1];
  if (nextValue === undefined || nextValue.startsWith('-')) {
    return { value: undefined, nextIndex: index + 1 };
  }

  return {
    value: nextValue,
    nextIndex: index + 2,
  };
}

function parseSecretNameFlag(
  argv: string[],
  index: number,
  parsed: ParsedSetupEnvArgs,
): { updated: boolean; nextIndex: number } {
  const { value, nextIndex } = parseFlagValue(argv, index, '--secret-name');
  if (!value) {
    parsed.error = 'Missing value for --secret-name.';
    return { updated: false, nextIndex };
  }
  parsed.secretNames = [
    ...(parsed.secretNames ?? []),
    ...parseSecretNames(value),
  ];
  return { updated: true, nextIndex };
}

function parseSecretNamesFlag(
  argv: string[],
  index: number,
  parsed: ParsedSetupEnvArgs,
): { updated: boolean; nextIndex: number } {
  const { value, nextIndex } = parseFlagValue(argv, index, '--secret-names');
  if (!value || parseSecretNames(value).length === 0) {
    parsed.error = 'Missing value for --secret-names.';
    return { updated: false, nextIndex };
  }
  parsed.secretNames = [
    ...(parsed.secretNames ?? []),
    ...parseSecretNames(value),
  ];
  return { updated: true, nextIndex };
}

function parseWriteToFlag(
  argv: string[],
  index: number,
  parsed: ParsedSetupEnvArgs,
): { updated: boolean; nextIndex: number } {
  const { value, nextIndex } = parseFlagValue(argv, index, '--write-to');
  if (!value) {
    parsed.error = 'Missing value for --write-to.';
    return { updated: false, nextIndex };
  }
  parsed.writeTo = value;
  return { updated: true, nextIndex };
}

export function parseSetupEnvArgs(argv: string[]): ParsedSetupEnvArgs {
  const parsed: ParsedSetupEnvArgs = {
    showHelp: false,
  };

  let index = 0;

  while (index < argv.length) {
    const token = argv[index];
    if (token === undefined) break;

    if (token === '-h' || token === '--help') {
      parsed.showHelp = true;
      index += 1;
      continue;
    }

    if (token === '--') {
      const command = argv[index + 1];
      const args = argv.slice(index + 2);
      if (!command) {
        parsed.error = 'Missing command to execute.';
        return parsed;
      }

      parsed.cliCommand = { command, args };
      return parsed;
    }

    if (token === '--secret-name' || token.startsWith('--secret-name=')) {
      const { updated, nextIndex } = parseSecretNameFlag(argv, index, parsed);
      if (!updated) {
        return parsed;
      }
      index = nextIndex;
      continue;
    }

    if (token === '--secret-names' || token.startsWith('--secret-names=')) {
      const { updated, nextIndex } = parseSecretNamesFlag(argv, index, parsed);
      if (!updated) {
        return parsed;
      }
      index = nextIndex;
      continue;
    }

    if (token === '--write-to' || token.startsWith('--write-to=')) {
      const { updated, nextIndex } = parseWriteToFlag(argv, index, parsed);
      if (!updated) {
        return parsed;
      }
      index = nextIndex;
      continue;
    }

    if (token.startsWith('-')) {
      parsed.error = `Unknown option: ${token}`;
      return parsed;
    }

    parsed.cliCommand = {
      command: token,
      args: argv.slice(index + 1),
    };
    return parsed;
  }

  if (!parsed.showHelp && !parsed.writeTo) {
    parsed.error = 'Missing command to execute.';
  }

  return parsed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizeSecretValues(
  secretPayload: unknown,
): Record<string, string> {
  if (!isPlainObject(secretPayload)) {
    throw new Error('Secret payload must be a plain object.');
  }

  const normalized: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(secretPayload)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(
        `Secret key "${key}" is not a valid environment variable name.`,
      );
    }

    if (typeof rawValue === 'string') {
      normalized[key] = rawValue;
      continue;
    }

    if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      normalized[key] = String(rawValue);
      continue;
    }

    if (rawValue === null) {
      throw new Error(`Secret value for "${key}" cannot be null.`);
    }

    throw new Error(
      `Secret value for "${key}" must be string, number, or boolean.`,
    );
  }

  return normalized;
}

function terminateChildProcess(
  child: SetupEnvChildProcess,
  runtime: SetupEnvRuntime,
  signal: NodeJS.Signals,
): void {
  if (runtime.useProcessGroup && child.pid !== undefined) {
    try {
      runtime.killProcessGroup(child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child if the process group is already gone.
    }
  }

  try {
    child.kill(signal);
  } catch {
    // The child may have exited between receiving the signal and this kill call.
  }
}

export async function runSetupEnv(
  argv: string[],
  runtimeOverrides: Partial<SetupEnvRuntime> = {},
): Promise<number> {
  const runtimeBase: SetupEnvRuntime = {
    ...defaultRuntime,
    ...runtimeOverrides,
  };
  const runtime: SetupEnvRuntime = {
    ...runtimeBase,
    fetchSecrets:
      runtimeOverrides.fetchSecrets ??
      ((secretName) =>
        fetchAwsSecret(secretName, runtimeBase.env.AWS_REGION || 'us-east-1')),
  };

  const parsedArgs = parseSetupEnvArgs(argv);

  if (parsedArgs.showHelp) {
    writeLine(runtime.stdout, usageText);
    return 0;
  }

  if (parsedArgs.error) {
    writeLine(runtime.stderr, createCliError(parsedArgs.error));
    writeLine(runtime.stderr, usageText);
    return 1;
  }

  if (parsedArgs.writeTo && parsedArgs.cliCommand) {
    writeLine(
      runtime.stderr,
      createCliError(
        'Cannot execute a command when --write-to is provided. Use one mode at a time.',
      ),
    );
    writeLine(runtime.stderr, usageText);
    return 1;
  }

  loadDotEnvFilesSync({ processEnv: runtime.env });

  const resolvedSecretNames = resolveSecretNames(
    parsedArgs.secretNames,
    runtime.env,
  );
  const secretNames = resolvedSecretNames.names;

  if (
    parsedArgs.secretNames !== undefined &&
    (resolvedSecretNames.source === 'SECRET_NAMES' ||
      resolvedSecretNames.source === 'SECRET_NAME')
  ) {
    writeLine(
      runtime.stdout,
      createCliError(
        `${resolvedSecretNames.source} is set, using it instead of --secret-name/--secret-names.`,
      ),
    );
  }

  if (secretNames.length === 0) {
    writeLine(
      runtime.stderr,
      createCliError(
        'Missing secret name. Provide --secret-name, --secret-names, or set SECRET_NAMES/SECRET_NAME in the environment.',
      ),
    );
    return 1;
  }

  const normalizedSecrets: Record<string, string> = {};

  for (const secretName of secretNames) {
    try {
      const secretPayload = await runtime.fetchSecrets(secretName);
      Object.assign(normalizedSecrets, normalizeSecretValues(secretPayload));
    } catch (error) {
      writeLine(
        runtime.stderr,
        createCliError(
          `Failed to fetch and parse secrets from AWS Secrets Manager (${secretName}): ${errorMessage(error)}`,
        ),
      );
      return 1;
    }
  }

  if (parsedArgs.writeTo) {
    try {
      await runtime.writeFile(
        parsedArgs.writeTo,
        serializeSecretsAsEnvFile(normalizedSecrets),
      );
      return 0;
    } catch (error) {
      writeLine(
        runtime.stderr,
        createCliError(
          `Failed to write secrets file (${parsedArgs.writeTo}): ${errorMessage(error)}`,
        ),
      );
      return 1;
    }
  }

  const childEnv: NodeJS.ProcessEnv = {
    ...normalizedSecrets,
    ...runtime.env,
  };

  const { command, args } = parsedArgs.cliCommand as CliCommand;

  return new Promise<number>((resolve) => {
    const child = runtime.spawn(command, args, {
      env: childEnv,
      stdio: 'inherit',
      detached: runtime.useProcessGroup,
    });
    let settled = false;
    let receivedSignal: NodeJS.Signals | undefined;

    const signalHandlers = signalsToForward.map((signal) => {
      const listener = () => {
        receivedSignal = signal;
        terminateChildProcess(child, runtime, signal);
      };

      runtime.addSignalListener(signal, listener);

      return { signal, listener };
    });

    let signalHandlersRemoved = false;

    const removeSignalHandlers = () => {
      if (signalHandlersRemoved) {
        return;
      }

      signalHandlersRemoved = true;

      for (const { signal, listener } of signalHandlers) {
        runtime.removeSignalListener(signal, listener);
      }
    };

    const finish = (exitCode: number) => {
      if (!settled) {
        settled = true;
        removeSignalHandlers();
        resolve(exitCode);
      }
    };

    child.on('error', (error: Error) => {
      writeLine(
        runtime.stderr,
        createCliError(
          `Failed to start command "${command}": ${errorMessage(error)}`,
        ),
      );
      finish(1);
    });

    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      const signalToPropagate = signal ?? receivedSignal;

      if (signalToPropagate) {
        removeSignalHandlers();
        try {
          runtime.propagateSignal(signalToPropagate);
        } catch {
          // Ignore propagation errors and preserve non-zero exit.
        }
        finish(1);
        return;
      }

      finish(code ?? 1);
    });
  });
}

const mainPath = process.argv[1];
if (
  mainPath &&
  (mainPath.endsWith('setup-environment.js') ||
    mainPath.endsWith('setup-environment.ts'))
) {
  void (async () => {
    process.exitCode = await runSetupEnv(process.argv.slice(2));
  })();
}
