import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createEnvironment } from '../create-environment';
import { Env } from '../env';

describe('Env', () => {
  const baseConfig = {
    PORT: {
      required: false,
      defaultValue: '3000',
      parse: (v: string) => parseInt(v, 10),
    },
    API_KEY: {
      required: true,
    },
  };

  it('should initialize with local values', async () => {
    const env = new Env({
      config: baseConfig,
      options: {
        setEnvCallback: () => ({
          PORT: '8080',
          API_KEY: 'test-key',
        }),
      },
    });

    await env.initialize();
    const values = env.get();

    expect(values.PORT).toBe(8080);
    expect(values.API_KEY).toBe('test-key');
  });

  it('should use default values when env vars are missing', async () => {
    const env = new Env({
      config: baseConfig,
      options: {
        setEnvCallback: () => ({
          API_KEY: 'test-key',
        }),
      },
    });

    await env.initialize();
    const values = env.get();

    expect(values.PORT).toBe(3000);
  });

  it('should throw error when required variable is missing', async () => {
    const env = new Env({
      config: baseConfig,
      options: {
        setEnvCallback: () => ({}),
      },
    });

    await expect(env.initialize()).rejects.toThrow(
      'Missing required environment variables: API_KEY',
    );
  });

  it('should parse values correctly', async () => {
    const env = new Env({
      config: baseConfig,
      options: {
        setEnvCallback: () => ({
          PORT: '5000',
          API_KEY: 'key',
        }),
      },
    });

    await env.initialize();
    const values = env.get();

    expect(values.PORT).toBe(5000);
    expect(typeof values.PORT).toBe('number');
  });

  it('should initialize synchronously with local values', () => {
    const env = new Env({
      config: baseConfig,
      options: {
        setEnvCallback: () => ({
          PORT: '8080',
          API_KEY: 'test-key',
        }),
      },
    });

    env.initializeSync();
    const values = env.get();

    expect(values.PORT).toBe(8080);
    expect(values.API_KEY).toBe('test-key');
  });

  it('should throw when sync callback returns a Promise', () => {
    const env = new Env({
      config: baseConfig,
      options: {
        // @ts-expect-error Testing runtime validation
        setEnvCallback: async () => ({ API_KEY: 'test-key' }),
      },
    });

    expect(() => env.initializeSync()).toThrow(
      '[env] setEnvCallback returned a Promise during sync initialization. Use a synchronous callback or call initialize().',
    );
  });

  it('should auto-initialize on getAsync', async () => {
    const env = new Env({
      config: baseConfig,
      options: {
        setEnvCallback: () => ({
          API_KEY: 'test-key',
        }),
      },
    });

    const values = await env.getAsync();
    expect(values.API_KEY).toBe('test-key');
    expect(values.PORT).toBe(3000);
  });

  it('should load values from dotenv files by default when no callback is provided', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'env-dotenv-default-'),
    );
    const dotEnvPath = path.join(tempDir, '.env.local-test');
    fs.writeFileSync(dotEnvPath, 'DOTENV_DEFAULT_KEY=from-dotenv\n', 'utf8');
    delete process.env.DOTENV_DEFAULT_KEY;

    try {
      const env = new Env({
        config: {
          DOTENV_DEFAULT_KEY: {
            required: true,
          },
        },
        options: {
          dotEnvPath,
        },
      });

      env.initializeSync();
      const values = env.get();
      expect(values.DOTENV_DEFAULT_KEY).toBe('from-dotenv');
    } finally {
      delete process.env.DOTENV_DEFAULT_KEY;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should load default dotenv paths in order and let later files override earlier ones', () => {
    const originalCwd = process.cwd();
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'env-dotenv-default-paths-'),
    );
    const envPath = path.join(tempDir, '.env');
    const envDevelopmentPath = path.join(tempDir, '.env.development');
    const envLocalPath = path.join(tempDir, '.env.local');

    fs.writeFileSync(envPath, 'DOTENV_DEFAULT_ORDER_KEY=from-env\n', 'utf8');
    fs.writeFileSync(
      envDevelopmentPath,
      'DOTENV_DEFAULT_ORDER_KEY=from-env-development\n',
      'utf8',
    );
    fs.writeFileSync(
      envLocalPath,
      'DOTENV_DEFAULT_ORDER_KEY=from-env-local\n',
      'utf8',
    );
    delete process.env.DOTENV_DEFAULT_ORDER_KEY;

    try {
      process.chdir(tempDir);

      const env = new Env({
        config: {
          DOTENV_DEFAULT_ORDER_KEY: {
            required: true,
          },
        },
      });

      env.initializeSync();
      const values = env.get();
      expect(values.DOTENV_DEFAULT_ORDER_KEY).toBe('from-env-local');
    } finally {
      process.chdir(originalCwd);
      delete process.env.DOTENV_DEFAULT_ORDER_KEY;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should keep existing process.env values over dotenv values', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'env-dotenv-precedence-'),
    );
    const dotEnvPath = path.join(tempDir, '.env.local-test');
    fs.writeFileSync(dotEnvPath, 'DOTENV_PRECEDENCE_KEY=from-dotenv\n', 'utf8');
    process.env.DOTENV_PRECEDENCE_KEY = 'from-process-env';

    try {
      const env = new Env({
        config: {
          DOTENV_PRECEDENCE_KEY: {
            required: true,
          },
        },
        options: {
          dotEnvPath,
        },
      });

      env.initializeSync();
      const values = env.get();
      expect(values.DOTENV_PRECEDENCE_KEY).toBe('from-process-env');
    } finally {
      delete process.env.DOTENV_PRECEDENCE_KEY;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should allow disabling dotenv loading', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'env-dotenv-disabled-'),
    );
    const dotEnvPath = path.join(tempDir, '.env.local-test');
    fs.writeFileSync(dotEnvPath, 'DOTENV_DISABLED_KEY=from-dotenv\n', 'utf8');
    delete process.env.DOTENV_DISABLED_KEY;

    try {
      const env = new Env({
        config: {
          DOTENV_DISABLED_KEY: {
            required: true,
          },
        },
        options: {
          loadDotEnv: false,
          dotEnvPath,
        },
      });

      expect(() => env.initializeSync()).toThrow(
        'Missing required environment variables: DOTENV_DISABLED_KEY',
      );
    } finally {
      delete process.env.DOTENV_DISABLED_KEY;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should load dotenv values by default even when setEnvCallback is provided', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'env-dotenv-callback-'),
    );
    const dotEnvPath = path.join(tempDir, '.env.local-test');
    fs.writeFileSync(dotEnvPath, 'DOTENV_CALLBACK_KEY=from-dotenv\n', 'utf8');
    delete process.env.DOTENV_CALLBACK_KEY;

    try {
      const env = new Env({
        config: {
          DOTENV_CALLBACK_KEY: {
            required: true,
          },
        },
        options: {
          setEnvCallback: () => ({ ...process.env }),
          dotEnvPath,
        },
      });

      env.initializeSync();
      const values = env.get();
      expect(values.DOTENV_CALLBACK_KEY).toBe('from-dotenv');
    } finally {
      delete process.env.DOTENV_CALLBACK_KEY;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('createEnvironment', () => {
  beforeEach(() => {
    const globalStore = globalThis as unknown as {
      __ENV_SYNC_SINGLETON__?: unknown;
    };
    delete globalStore.__ENV_SYNC_SINGLETON__;
  });

  const baseConfig = {
    API_KEY: {
      required: true,
    },
  };

  it('should create a synchronous getter and eagerly initialize', () => {
    const envGetter = createEnvironment(baseConfig, {
      setEnvCallback: () => ({ API_KEY: 'local-key' }),
    });

    const values = envGetter();
    expect(values).not.toBeInstanceOf(Promise);
    expect(values.API_KEY).toBe('local-key');
  });

  it('should create a singleton instance when requested', () => {
    const envGetter = createEnvironment(baseConfig, {
      isSingleton: true,
      setEnvCallback: () => ({ API_KEY: 'test' }),
    });

    const envGetter2 = createEnvironment(baseConfig, {
      isSingleton: true,
      setEnvCallback: () => ({ API_KEY: 'test2' }),
    });

    expect(envGetter.instance).toBe(envGetter2.instance);
  });

  it('should create different instances when isSingleton is false', () => {
    const envGetter = createEnvironment(baseConfig, {
      isSingleton: false,
      setEnvCallback: () => ({ API_KEY: 'test' }),
    });

    const envGetter2 = createEnvironment(baseConfig, {
      isSingleton: false,
      setEnvCallback: () => ({ API_KEY: 'test2' }),
    });

    expect(envGetter.instance).not.toBe(envGetter2.instance);
  });

  it('should pass dotenv options through createEnvironment', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'env-create-dotenv-'),
    );
    const dotEnvPath = path.join(tempDir, '.env.local-test');
    fs.writeFileSync(dotEnvPath, 'CREATE_DOTENV_KEY=from-dotenv\n', 'utf8');
    delete process.env.CREATE_DOTENV_KEY;

    try {
      const envGetter = createEnvironment(
        {
          CREATE_DOTENV_KEY: {
            required: true,
          },
        },
        {
          dotEnvPath,
        },
      );

      expect(envGetter().CREATE_DOTENV_KEY).toBe('from-dotenv');
    } finally {
      delete process.env.CREATE_DOTENV_KEY;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
