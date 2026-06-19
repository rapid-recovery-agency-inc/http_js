import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  normalizeSecretValues,
  parseSetupEnvArgs,
  runSetupEnv,
  SetupEnvChildProcess,
  SetupEnvSpawn,
  SetupEnvSpawnOptions,
} from '../setup-environment';

type CloseListener = (
  code: number | null,
  signal: NodeJS.Signals | null,
) => void;
type ErrorListener = (error: Error) => void;
type SignalListener = () => void;

function createWriter(): {
  chunks: string[];
  writer: { write: (chunk: string) => boolean };
} {
  const chunks: string[] = [];
  return {
    chunks,
    writer: {
      write: (chunk: string) => {
        chunks.push(chunk);
        return true;
      },
    },
  };
}

function createSpawnHarness(): {
  calls: Array<{
    command: string;
    args: string[];
    options: SetupEnvSpawnOptions;
  }>;
  killCalls: Array<NodeJS.Signals | undefined>;
  spawn: SetupEnvSpawn;
  emitClose: (code: number | null, signal?: NodeJS.Signals | null) => void;
  emitError: (error: Error) => void;
} {
  let closeListener: CloseListener | undefined;
  let errorListener: ErrorListener | undefined;
  const calls: Array<{
    command: string;
    args: string[];
    options: SetupEnvSpawnOptions;
  }> = [];
  const killCalls: Array<NodeJS.Signals | undefined> = [];

  const spawn: SetupEnvSpawn = (command, args, options) => {
    calls.push({ command, args, options });

    const child: SetupEnvChildProcess = {
      pid: 1234,
      kill(signal) {
        killCalls.push(signal);
        return true;
      },
      on(event, listener) {
        if (event === 'close') {
          closeListener = listener as CloseListener;
        } else if (event === 'error') {
          errorListener = listener as ErrorListener;
        }
        return child;
      },
    };

    return child;
  };

  return {
    calls,
    killCalls,
    spawn,
    emitClose: (code, signal = null) => {
      closeListener?.(code, signal);
    },
    emitError: (error) => {
      errorListener?.(error);
    },
  };
}

function createSignalHarness(): {
  addSignalListener: (signal: NodeJS.Signals, listener: SignalListener) => void;
  removeSignalListener: (
    signal: NodeJS.Signals,
    listener: SignalListener,
  ) => void;
  emitSignal: (signal: NodeJS.Signals) => void;
  listenerCount: () => number;
} {
  const listenersBySignal = new Map<NodeJS.Signals, Set<SignalListener>>();

  const addSignalListener = jest.fn(
    (signal: NodeJS.Signals, listener: SignalListener) => {
      const listeners =
        listenersBySignal.get(signal) ?? new Set<SignalListener>();
      listeners.add(listener);
      listenersBySignal.set(signal, listeners);
    },
  );

  const removeSignalListener = jest.fn(
    (signal: NodeJS.Signals, listener: SignalListener) => {
      const listeners = listenersBySignal.get(signal);
      listeners?.delete(listener);

      if (listeners?.size === 0) {
        listenersBySignal.delete(signal);
      }
    },
  );

  return {
    addSignalListener,
    removeSignalListener,
    emitSignal: (signal) => {
      for (const listener of listenersBySignal.get(signal) ?? []) {
        listener();
      }
    },
    listenerCount: () =>
      Array.from(listenersBySignal.values()).reduce(
        (count, listeners) => count + listeners.size,
        0,
      ),
  };
}

describe('parseSetupEnvArgs', () => {
  it('should parse options and command with delimiter', () => {
    const parsed = parseSetupEnvArgs([
      '--secret-name',
      'prod/app',
      '--',
      'next',
      'start',
    ]);

    expect(parsed.error).toBeUndefined();
    expect(parsed.secretNames).toEqual(['prod/app']);
    expect(parsed.cliCommand).toEqual({
      command: 'next',
      args: ['start'],
    });
  });

  it('should parse comma-separated secret names', () => {
    const parsed = parseSetupEnvArgs([
      '--secret-names',
      'prod/base,prod/app',
      '--',
      'next',
      'start',
    ]);

    expect(parsed.error).toBeUndefined();
    expect(parsed.secretNames).toEqual(['prod/base', 'prod/app']);
  });

  it('should parse inline comma-separated secret names', () => {
    const parsed = parseSetupEnvArgs([
      '--secret-names=prod/base,prod/app',
      '--',
      'next',
      'start',
    ]);

    expect(parsed.error).toBeUndefined();
    expect(parsed.secretNames).toEqual(['prod/base', 'prod/app']);
  });

  it('should parse write-to mode without command', () => {
    const parsed = parseSetupEnvArgs([
      '--secret-name',
      'prod/app',
      '--write-to',
      '.env.production',
    ]);

    expect(parsed.error).toBeUndefined();
    expect(parsed.secretNames).toEqual(['prod/app']);
    expect(parsed.writeTo).toBe('.env.production');
    expect(parsed.cliCommand).toBeUndefined();
  });

  it('should fail when write-to value is missing', () => {
    const parsed = parseSetupEnvArgs(['--write-to']);

    expect(parsed.error).toBe('Missing value for --write-to.');
  });

  it('should reject unknown options', () => {
    const parsed = parseSetupEnvArgs(['--unknown', 'next', 'start']);

    expect(parsed.error).toBe('Unknown option: --unknown');
  });
});

describe('normalizeSecretValues', () => {
  it('should coerce supported primitives to strings', () => {
    const normalized = normalizeSecretValues({
      APP_NAME: 'insightt',
      RETRY_LIMIT: 3,
      ENABLE_METRICS: true,
    });

    expect(normalized).toEqual({
      APP_NAME: 'insightt',
      RETRY_LIMIT: '3',
      ENABLE_METRICS: 'true',
    });
  });

  it('should reject nested values', () => {
    expect(() =>
      normalizeSecretValues({
        NESTED: {
          KEY: 'value',
        },
      }),
    ).toThrow('Secret value for "NESTED" must be string, number, or boolean.');
  });
});

describe('runSetupEnv', () => {
  it('should run command with merged env and local precedence', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const spawnHarness = createSpawnHarness();
    const fetchSecrets = jest.fn().mockResolvedValue({
      API_KEY: 'secret-api',
      RETRIES: 2,
      FEATURE_ENABLED: true,
    });

    const runPromise = runSetupEnv(['--', 'next', 'start'], {
      env: {
        SECRET_NAME: 'prod/web',
        API_KEY: 'local-api',
      },
      fetchSecrets,
      spawn: spawnHarness.spawn,
      stdout: stdout.writer,
      stderr: stderr.writer,
    });

    await Promise.resolve();

    expect(fetchSecrets).toHaveBeenCalledWith('prod/web');
    expect(spawnHarness.calls).toHaveLength(1);
    expect(spawnHarness.calls[0]!.command).toBe('next');
    expect(spawnHarness.calls[0]!.args).toEqual(['start']);
    expect(spawnHarness.calls[0]!.options.env.API_KEY).toBe('local-api');
    expect(spawnHarness.calls[0]!.options.env.RETRIES).toBe('2');
    expect(spawnHarness.calls[0]!.options.env.FEATURE_ENABLED).toBe('true');
    expect(spawnHarness.calls[0]!.options.stdio).toBe('inherit');

    spawnHarness.emitClose(0);

    await expect(runPromise).resolves.toBe(0);
    expect(stdout.chunks).toEqual([]);
    expect(stderr.chunks).toEqual([]);
  });

  it('should prefer SECRET_NAME from runtime env over --secret-name', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const spawnHarness = createSpawnHarness();
    const fetchSecrets = jest.fn().mockResolvedValue({});

    const runPromise = runSetupEnv(
      ['--secret-name', 'prod/cli', '--', 'node', 'server.js'],
      {
        env: {
          SECRET_NAME: 'prod/runtime',
        },
        fetchSecrets,
        spawn: spawnHarness.spawn,
        stdout: stdout.writer,
        stderr: stderr.writer,
      },
    );

    await Promise.resolve();

    expect(fetchSecrets).toHaveBeenCalledWith('prod/runtime');
    expect(fetchSecrets).not.toHaveBeenCalledWith('prod/cli');
    expect(spawnHarness.calls).toHaveLength(1);
    expect(stdout.chunks).toEqual([
      '[setup-environment] SECRET_NAME is set, using it instead of --secret-name/--secret-names.\n',
    ]);

    spawnHarness.emitClose(0);
    await expect(runPromise).resolves.toBe(0);
  });

  it('should load SECRET_NAME from dotenv before resolving secrets', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const spawnHarness = createSpawnHarness();
    const fetchSecrets = jest.fn().mockResolvedValue({});
    const originalCwd = process.cwd();
    const originalSecretName = process.env.SECRET_NAME;
    const originalSecretNames = process.env.SECRET_NAMES;
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'setup-environment-dotenv-'),
    );

    fs.writeFileSync(
      path.join(tempDir, '.env'),
      'SECRET_NAME=local/insightt/hr-api\n',
      'utf8',
    );
    delete process.env.SECRET_NAME;
    delete process.env.SECRET_NAMES;

    try {
      process.chdir(tempDir);

      const runPromise = runSetupEnv(
        ['--secret-name', 'prod/cli', '--', 'node', 'server.js'],
        {
          fetchSecrets,
          spawn: spawnHarness.spawn,
          stdout: stdout.writer,
          stderr: stderr.writer,
        },
      );

      await Promise.resolve();

      expect(fetchSecrets).toHaveBeenCalledWith('local/insightt/hr-api');
      expect(fetchSecrets).not.toHaveBeenCalledWith('prod/cli');
      expect(spawnHarness.calls).toHaveLength(1);
      expect(stdout.chunks).toEqual([
        '[setup-environment] SECRET_NAME is set, using it instead of --secret-name/--secret-names.\n',
      ]);

      spawnHarness.emitClose(0);
      await expect(runPromise).resolves.toBe(0);
    } finally {
      process.chdir(originalCwd);

      if (originalSecretName === undefined) {
        delete process.env.SECRET_NAME;
      } else {
        process.env.SECRET_NAME = originalSecretName;
      }

      if (originalSecretNames === undefined) {
        delete process.env.SECRET_NAMES;
      } else {
        process.env.SECRET_NAMES = originalSecretNames;
      }

      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should fallback to SECRET_NAME when SECRET_NAMES is empty', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const spawnHarness = createSpawnHarness();
    const fetchSecrets = jest.fn().mockResolvedValue({});

    const runPromise = runSetupEnv(
      ['--secret-name', 'prod/cli', '--', 'node', 'server.js'],
      {
        env: {
          SECRET_NAMES: '',
          SECRET_NAME: 'prod/runtime',
        },
        fetchSecrets,
        spawn: spawnHarness.spawn,
        stdout: stdout.writer,
        stderr: stderr.writer,
      },
    );

    await Promise.resolve();

    expect(fetchSecrets).toHaveBeenCalledWith('prod/runtime');
    expect(fetchSecrets).not.toHaveBeenCalledWith('prod/cli');
    expect(spawnHarness.calls).toHaveLength(1);
    expect(stdout.chunks).toEqual([
      '[setup-environment] SECRET_NAME is set, using it instead of --secret-name/--secret-names.\n',
    ]);

    spawnHarness.emitClose(0);
    await expect(runPromise).resolves.toBe(0);
  });

  it('should fail when secret name is missing', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchSecrets = jest.fn();
    const spawnHarness = createSpawnHarness();

    const exitCode = await runSetupEnv(['--', 'next', 'start'], {
      env: {
        AWS_REGION: 'us-east-2',
      },
      fetchSecrets,
      spawn: spawnHarness.spawn,
      stdout: stdout.writer,
      stderr: stderr.writer,
    });

    expect(exitCode).toBe(1);
    expect(fetchSecrets).not.toHaveBeenCalled();
    expect(spawnHarness.calls).toHaveLength(0);
    expect(stderr.chunks.join('')).toContain('Missing secret name');
  });

  it('should fail when command is missing', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchSecrets = jest.fn();
    const spawnHarness = createSpawnHarness();

    const exitCode = await runSetupEnv(['--secret-name', 'prod/web'], {
      env: {},
      fetchSecrets,
      spawn: spawnHarness.spawn,
      stdout: stdout.writer,
      stderr: stderr.writer,
    });

    expect(exitCode).toBe(1);
    expect(fetchSecrets).not.toHaveBeenCalled();
    expect(spawnHarness.calls).toHaveLength(0);
    expect(stderr.chunks.join('')).toContain('Missing command to execute');
  });

  it('should write fetched secrets to file when --write-to is provided', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchSecrets = jest.fn().mockResolvedValue({
      API_KEY: 'secret-api',
      RETRIES: 2,
      FEATURE_ENABLED: true,
      EMPTY_VALUE: '',
      JSON_VALUE: '{"name":"insightt"}',
    });
    const writeFile = jest.fn().mockResolvedValue(undefined);
    const spawnHarness = createSpawnHarness();

    const exitCode = await runSetupEnv(
      ['--secret-name', 'prod/web', '--write-to', '.env.production'],
      {
        env: {},
        fetchSecrets,
        writeFile,
        spawn: spawnHarness.spawn,
        stdout: stdout.writer,
        stderr: stderr.writer,
      },
    );

    expect(exitCode).toBe(0);
    expect(fetchSecrets).toHaveBeenCalledWith('prod/web');
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(
      '.env.production',
      'API_KEY=secret-api\nRETRIES=2\nFEATURE_ENABLED=true\nEMPTY_VALUE=\"\"\nJSON_VALUE=\"{\\\"name\\\":\\\"insightt\\\"}\"\n',
    );
    expect(spawnHarness.calls).toHaveLength(0);
    expect(stderr.chunks).toEqual([]);
  });

  it('should fail when write-to and command execution are combined', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchSecrets = jest.fn();
    const writeFile = jest.fn();
    const spawnHarness = createSpawnHarness();

    const exitCode = await runSetupEnv(
      [
        '--secret-name',
        'prod/web',
        '--write-to',
        '.env.production',
        '--',
        'next',
      ],
      {
        env: {},
        fetchSecrets,
        writeFile,
        spawn: spawnHarness.spawn,
        stdout: stdout.writer,
        stderr: stderr.writer,
      },
    );

    expect(exitCode).toBe(1);
    expect(fetchSecrets).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(spawnHarness.calls).toHaveLength(0);
    expect(stderr.chunks.join('')).toContain(
      'Cannot execute a command when --write-to is provided',
    );
  });

  it('should fail when writing secrets to file fails', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchSecrets = jest.fn().mockResolvedValue({
      API_KEY: 'secret-api',
    });
    const writeFile = jest.fn().mockRejectedValue(new Error('EACCES'));
    const spawnHarness = createSpawnHarness();

    const exitCode = await runSetupEnv(
      ['--secret-name', 'prod/web', '--write-to', '.env.production'],
      {
        env: {},
        fetchSecrets,
        writeFile,
        spawn: spawnHarness.spawn,
        stdout: stdout.writer,
        stderr: stderr.writer,
      },
    );

    expect(exitCode).toBe(1);
    expect(fetchSecrets).toHaveBeenCalledWith('prod/web');
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(spawnHarness.calls).toHaveLength(0);
    expect(stderr.chunks.join('')).toContain('Failed to write secrets file');
    expect(stderr.chunks.join('')).toContain('EACCES');
  });

  it('should fetch and merge multiple secrets from --secret-names in order', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const spawnHarness = createSpawnHarness();
    const fetchSecrets = jest
      .fn()
      .mockImplementation(async (secretName: string) => {
        if (secretName === 'prod/base') {
          return {
            SHARED_KEY: 'base-value',
            BASE_ONLY: 'base-only',
          };
        }

        return {
          SHARED_KEY: 'app-value',
          APP_ONLY: 'app-only',
        };
      });

    const runPromise = runSetupEnv(
      ['--secret-names', 'prod/base,prod/app', '--', 'node', 'server.js'],
      {
        env: {
          SHARED_KEY: 'local-value',
        },
        fetchSecrets,
        spawn: spawnHarness.spawn,
        stdout: stdout.writer,
        stderr: stderr.writer,
      },
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSecrets.mock.calls.map(([secretName]) => secretName)).toEqual([
      'prod/base',
      'prod/app',
    ]);
    expect(spawnHarness.calls).toHaveLength(1);
    expect(spawnHarness.calls[0]!.options.env.BASE_ONLY).toBe('base-only');
    expect(spawnHarness.calls[0]!.options.env.APP_ONLY).toBe('app-only');
    expect(spawnHarness.calls[0]!.options.env.SHARED_KEY).toBe('local-value');

    spawnHarness.emitClose(0);
    await expect(runPromise).resolves.toBe(0);
  });

  it('should fetch and merge multiple secrets from SECRET_NAMES runtime env var', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const spawnHarness = createSpawnHarness();
    const fetchSecrets = jest
      .fn()
      .mockImplementation(async (secretName: string) => {
        if (secretName === 'prod/base') {
          return {
            BASE_ONLY: 'base-only',
          };
        }

        return {
          APP_ONLY: 'app-only',
        };
      });

    const runPromise = runSetupEnv(['--', 'node', 'server.js'], {
      env: {
        SECRET_NAMES: 'prod/base,prod/app',
      },
      fetchSecrets,
      spawn: spawnHarness.spawn,
      stdout: stdout.writer,
      stderr: stderr.writer,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSecrets.mock.calls.map(([secretName]) => secretName)).toEqual([
      'prod/base',
      'prod/app',
    ]);
    expect(spawnHarness.calls).toHaveLength(1);
    expect(spawnHarness.calls[0]!.options.env.BASE_ONLY).toBe('base-only');
    expect(spawnHarness.calls[0]!.options.env.APP_ONLY).toBe('app-only');

    spawnHarness.emitClose(0);
    await expect(runPromise).resolves.toBe(0);
  });

  it('should prefer SECRET_NAMES from runtime env over CLI secret flags and print a notice', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const spawnHarness = createSpawnHarness();
    const fetchSecrets = jest.fn().mockResolvedValue({});

    const runPromise = runSetupEnv(
      ['--secret-name', 'prod/cli', '--', 'node', 'server.js'],
      {
        env: {
          SECRET_NAMES: 'prod/base,prod/app',
        },
        fetchSecrets,
        spawn: spawnHarness.spawn,
        stdout: stdout.writer,
        stderr: stderr.writer,
      },
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSecrets.mock.calls.map(([secretName]) => secretName)).toEqual([
      'prod/base',
      'prod/app',
    ]);
    expect(fetchSecrets).not.toHaveBeenCalledWith('prod/cli');
    expect(spawnHarness.calls).toHaveLength(1);
    expect(stdout.chunks).toEqual([
      '[setup-environment] SECRET_NAMES is set, using it instead of --secret-name/--secret-names.\n',
    ]);
    expect(stderr.chunks).toEqual([]);

    spawnHarness.emitClose(0);
    await expect(runPromise).resolves.toBe(0);
  });

  it('should prefer SECRET_NAMES over SECRET_NAME when both are set', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const spawnHarness = createSpawnHarness();
    const fetchSecrets = jest.fn().mockResolvedValue({});

    const runPromise = runSetupEnv(['--', 'node', 'server.js'], {
      env: {
        SECRET_NAMES: 'prod/base,prod/app',
        SECRET_NAME: 'prod/legacy',
      },
      fetchSecrets,
      spawn: spawnHarness.spawn,
      stdout: stdout.writer,
      stderr: stderr.writer,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSecrets.mock.calls.map(([secretName]) => secretName)).toEqual([
      'prod/base',
      'prod/app',
    ]);
    expect(spawnHarness.calls).toHaveLength(1);

    spawnHarness.emitClose(0);
    await expect(runPromise).resolves.toBe(0);
  });

  it('should fail fast when AWS fetch fails', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchSecrets = jest
      .fn()
      .mockRejectedValue(new Error('AccessDeniedException'));
    const spawnHarness = createSpawnHarness();

    const exitCode = await runSetupEnv(['--', 'next', 'start'], {
      env: {
        SECRET_NAME: 'prod/web',
      },
      fetchSecrets,
      spawn: spawnHarness.spawn,
      stdout: stdout.writer,
      stderr: stderr.writer,
    });

    expect(exitCode).toBe(1);
    expect(spawnHarness.calls).toHaveLength(0);
    expect(stderr.chunks.join('')).toContain('AccessDeniedException');
  });

  it('should fail when secret payload contains unsupported values', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchSecrets = jest.fn().mockResolvedValue({
      DB: { HOST: 'db.example.com' },
    });
    const spawnHarness = createSpawnHarness();

    const exitCode = await runSetupEnv(['--', 'next', 'start'], {
      env: {
        SECRET_NAME: 'prod/web',
      },
      fetchSecrets,
      spawn: spawnHarness.spawn,
      stdout: stdout.writer,
      stderr: stderr.writer,
    });

    expect(exitCode).toBe(1);
    expect(spawnHarness.calls).toHaveLength(0);
    expect(stderr.chunks.join('')).toContain(
      'must be string, number, or boolean',
    );
  });

  it('should propagate child non-zero exit code', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const spawnHarness = createSpawnHarness();
    const fetchSecrets = jest.fn().mockResolvedValue({});

    const runPromise = runSetupEnv(['--', 'node', 'server.js'], {
      env: {
        SECRET_NAME: 'prod/web',
      },
      fetchSecrets,
      spawn: spawnHarness.spawn,
      stdout: stdout.writer,
      stderr: stderr.writer,
    });

    await Promise.resolve();
    spawnHarness.emitClose(3);

    await expect(runPromise).resolves.toBe(3);
  });

  it('should propagate child process signal termination', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const spawnHarness = createSpawnHarness();
    const fetchSecrets = jest.fn().mockResolvedValue({});
    const propagateSignal = jest.fn();

    const runPromise = runSetupEnv(['--', 'node', 'server.js'], {
      env: {
        SECRET_NAME: 'prod/web',
      },
      fetchSecrets,
      spawn: spawnHarness.spawn,
      stdout: stdout.writer,
      stderr: stderr.writer,
      propagateSignal,
    });

    await Promise.resolve();
    spawnHarness.emitClose(null, 'SIGTERM');

    await expect(runPromise).resolves.toBe(1);
    expect(propagateSignal).toHaveBeenCalledWith('SIGTERM');
  });

  it('should terminate the wrapped process group when setup-environment receives a stop signal', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const signalHarness = createSignalHarness();
    const spawnHarness = createSpawnHarness();
    const fetchSecrets = jest.fn().mockResolvedValue({});
    const killProcessGroup = jest.fn();
    const propagateSignal = jest.fn();

    const runPromise = runSetupEnv(['--', 'node', 'server.js'], {
      env: {
        SECRET_NAME: 'prod/web',
      },
      fetchSecrets,
      spawn: spawnHarness.spawn,
      stdout: stdout.writer,
      stderr: stderr.writer,
      addSignalListener: signalHarness.addSignalListener,
      removeSignalListener: signalHarness.removeSignalListener,
      killProcessGroup,
      propagateSignal,
      useProcessGroup: true,
    });

    await Promise.resolve();

    expect(spawnHarness.calls).toHaveLength(1);
    expect(spawnHarness.calls[0]!.options.detached).toBe(true);

    signalHarness.emitSignal('SIGTERM');

    expect(killProcessGroup).toHaveBeenCalledWith(1234, 'SIGTERM');
    expect(spawnHarness.killCalls).toEqual([]);

    spawnHarness.emitClose(0);

    await expect(runPromise).resolves.toBe(1);
    expect(propagateSignal).toHaveBeenCalledWith('SIGTERM');
    expect(signalHarness.listenerCount()).toBe(0);
  });

  it('should terminate the wrapped child directly when process groups are disabled', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const signalHarness = createSignalHarness();
    const spawnHarness = createSpawnHarness();
    const fetchSecrets = jest.fn().mockResolvedValue({});
    const killProcessGroup = jest.fn();
    const propagateSignal = jest.fn();

    const runPromise = runSetupEnv(['--', 'node', 'server.js'], {
      env: {
        SECRET_NAME: 'prod/web',
      },
      fetchSecrets,
      spawn: spawnHarness.spawn,
      stdout: stdout.writer,
      stderr: stderr.writer,
      addSignalListener: signalHarness.addSignalListener,
      removeSignalListener: signalHarness.removeSignalListener,
      killProcessGroup,
      propagateSignal,
      useProcessGroup: false,
    });

    await Promise.resolve();

    expect(spawnHarness.calls).toHaveLength(1);
    expect(spawnHarness.calls[0]!.options.detached).toBe(false);

    signalHarness.emitSignal('SIGINT');

    expect(killProcessGroup).not.toHaveBeenCalled();
    expect(spawnHarness.killCalls).toEqual(['SIGINT']);

    spawnHarness.emitClose(null, 'SIGINT');

    await expect(runPromise).resolves.toBe(1);
    expect(propagateSignal).toHaveBeenCalledWith('SIGINT');
    expect(signalHarness.listenerCount()).toBe(0);
  });

  it('should fail when spawning command errors', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const spawnHarness = createSpawnHarness();
    const fetchSecrets = jest.fn().mockResolvedValue({});

    const runPromise = runSetupEnv(['--', 'node', 'server.js'], {
      env: {
        SECRET_NAME: 'prod/web',
      },
      fetchSecrets,
      spawn: spawnHarness.spawn,
      stdout: stdout.writer,
      stderr: stderr.writer,
    });

    await Promise.resolve();
    spawnHarness.emitError(new Error('ENOENT'));

    await expect(runPromise).resolves.toBe(1);
    expect(stderr.chunks.join('')).toContain('Failed to start command "node"');
  });
});
