import { createEnvironment } from '../create-environment';

describe('createEnvironment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete (globalThis as any).__ENV_SYNC_SINGLETON__;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should parse variables, apply defaults, and return the data', () => {
    process.env.APP_PORT = '4000';
    process.env.IS_DEV = 'true';

    const testConfig = {
      APP_PORT: { parse: (v: string) => parseInt(v, 10) },
      IS_DEV: { parse: (v: string) => v === 'true' },
      API_TIMEOUT: {
        defaultValue: '5000',
        parse: (v: string) => parseInt(v, 10),
      },
    };

    const getEnv = createEnvironment(testConfig, {
      isSingleton: false,
      loadDotEnv: false,
    });
    const env = getEnv();

    expect(env.APP_PORT).toBe(4000);
    expect(env.IS_DEV).toBe(true);
    expect(env.API_TIMEOUT).toBe(5000);
  });

  it('should throw an error if a required variable is missing', () => {
    delete process.env.CRITICAL_SECRET;

    const testConfig = {
      CRITICAL_SECRET: { required: true },
    };

    expect(() => {
      createEnvironment(testConfig, { isSingleton: false, loadDotEnv: false });
    }).toThrow(/Missing required environment variables: CRITICAL_SECRET/);
  });

  it('should return the exact same instance when isSingleton is true', () => {
    const testConfig = { PORT: { defaultValue: '3000' } };

    const getEnv1 = createEnvironment(testConfig, {
      isSingleton: true,
      loadDotEnv: false,
    });
    const getEnv2 = createEnvironment(testConfig, {
      isSingleton: true,
      loadDotEnv: false,
    });

    expect(getEnv1.instance).toBe(getEnv2.instance);
  });

  it('should use custom setEnvCallback instead of process.env', () => {
    const testConfig = { CUSTOM_VAR: { required: true } };
    const mockCallback = jest.fn(() => ({ CUSTOM_VAR: 'custom_value' }));

    const getEnv = createEnvironment(testConfig, {
      isSingleton: false,
      loadDotEnv: false,
      setEnvCallback: mockCallback,
    });

    const env = getEnv();

    expect(mockCallback).toHaveBeenCalled();
    expect(env.CUSTOM_VAR).toBe('custom_value');
  });

  it('should throw an error if setEnvCallback returns a Promise', () => {
    const testConfig = { PORT: { defaultValue: '3000' } };
    const asyncCallback = () => Promise.resolve({ PORT: '4000' }) as any;

    expect(() => {
      createEnvironment(testConfig, {
        isSingleton: false,
        loadDotEnv: false,
        setEnvCallback: asyncCallback,
      });
    }).toThrow(/setEnvCallback returned a Promise/);
  });
});
