import { Env } from './env';
import {
  CreateEnvironmentOptions,
  EnvVarOptions,
  InferEnvValue,
} from './types';

/**
 * Helper function to create a type-safe Env instance with synchronous initialization.
 * @param config - Environment variable configuration.
 * @param options - Sync environment creation options.
 * @returns A synchronous getter function with an attached Env instance.
 */
export function createEnvironment<C extends Record<string, EnvVarOptions>>(
  config: C,
  options?: CreateEnvironmentOptions<C>,
): (() => { [K in keyof C]: InferEnvValue<C[K]> }) & { instance: Env<C> } {
  const isSingleton = options?.isSingleton;
  const envOptions: any = {};
  if (options) {
    if (options.setEnvCallback !== undefined)
      envOptions.setEnvCallback = options.setEnvCallback;
    if (options.loadDotEnv !== undefined)
      envOptions.loadDotEnv = options.loadDotEnv;
    if (options.dotEnvPath !== undefined)
      envOptions.dotEnvPath = options.dotEnvPath;
    if (options.dotEnvOverride !== undefined)
      envOptions.dotEnvOverride = options.dotEnvOverride;
  }
  let envInstance: Env<C>;

  if (isSingleton) {
    const globalStore = globalThis as unknown as {
      __ENV_SYNC_SINGLETON__?: Env<C>;
    };

    if (!globalStore.__ENV_SYNC_SINGLETON__) {
      globalStore.__ENV_SYNC_SINGLETON__ = new Env<C>({
        config,
        options: envOptions,
      });
    }

    envInstance = globalStore.__ENV_SYNC_SINGLETON__;
  } else {
    envInstance = new Env<C>({
      config,
      options: envOptions,
    });
  }

  envInstance.initializeSync();

  const getter = () => envInstance.get();
  getter.instance = envInstance;

  return getter as (() => { [K in keyof C]: InferEnvValue<C[K]> }) & {
    instance: Env<C>;
  };
}
