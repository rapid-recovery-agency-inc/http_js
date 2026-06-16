import { loadDotEnvFilesSync } from './dotenv-loader';
import {
  EnvCallback,
  EnvConstructorOptions,
  EnvVarOptions,
  InferEnvValue,
} from './types';

export class Env<C extends Record<string, EnvVarOptions>> {
  private config: C;
  private values: Record<string, unknown> = {};
  private initialized: boolean = false;
  private setEnvCallback: EnvCallback;

  constructor(options: EnvConstructorOptions<C>) {
    this.config = options.config;
    const shouldLoadDotEnv = options.options?.loadDotEnv ?? true;
    if (shouldLoadDotEnv) {
      const loadOpts: any = {};
      if (options.options?.dotEnvPath !== undefined)
        loadOpts.path = options.options.dotEnvPath;
      if (options.options?.dotEnvOverride !== undefined)
        loadOpts.override = options.options.dotEnvOverride;
      loadDotEnvFilesSync(loadOpts);
    }

    // callback defaults to process.env
    this.setEnvCallback =
      options.options?.setEnvCallback || (() => ({ ...process.env }));
  }

  private isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      'then' in value &&
      typeof value.then === 'function'
    );
  }

  /**
   * Check if the environment has been initialized.
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initialize asynchronously for compatibility.
   * Initialization reads values synchronously from local environment only.
   */
  public async initialize(): Promise<void> {
    this.initializeSync();
  }

  /**
   * Initialize synchronously from local environment values only.
   */
  public initializeSync(): void {
    if (this.initialized) {
      return;
    }

    const callbackResult = this.setEnvCallback();
    if (this.isPromiseLike(callbackResult)) {
      throw new Error(
        '[env] setEnvCallback returned a Promise during sync initialization. Use a synchronous callback or call initialize().',
      );
    }

    this.processEnvValues(callbackResult);
    this.validate();
    this.initialized = true;
  }

  /**
   * Process environment values from a source object.
   * Applies default values and parsing where necessary.
   */
  private processEnvValues(env: Record<string, string | undefined>): void {
    for (const key in this.config) {
      const options = this.config[key];
      if (!options) continue;
      const rawValue = env[key];

      let valueToUse: string | undefined = undefined;

      if (rawValue !== undefined && rawValue !== '') {
        valueToUse = rawValue;
      } else if (options.defaultValue !== undefined) {
        valueToUse = options.defaultValue;
      }

      if (valueToUse !== undefined) {
        if (options.parse) {
          this.values[key] = options.parse(valueToUse);
        } else {
          this.values[key] = valueToUse;
        }
      } else {
        this.values[key] = undefined;
      }
    }
  }

  /**
   * Validates that all required variables are present.
   * Throws an error containing all missing variables if validation fails.
   */
  public validate(): void {
    const missingVars: string[] = [];

    for (const key in this.config) {
      const options = this.config[key];
      if (!options) continue;
      const value = this.values[key];

      if (options.required && (value === undefined || value === null)) {
        missingVars.push(key);
      }
    }

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(', ')}`,
      );
    }
  }

  /**
   * Access the full environment object synchronously.
   * Throws if not initialized.
   */
  public get(): { [K in keyof C]: InferEnvValue<C[K]> } {
    if (!this.initialized) {
      throw new Error(
        'Environment not initialized. Call .initializeSync() or await .initialize() first.',
      );
    }
    return this.values as {
      [K in keyof C]: InferEnvValue<C[K]>;
    };
  }

  /**
   * Access the full environment object asynchronously.
   * Auto-initializes if not already initialized.
   */
  public async getAsync(): Promise<{ [K in keyof C]: InferEnvValue<C[K]> }> {
    if (!this.initialized) {
      this.initializeSync();
    }
    return this.values as {
      [K in keyof C]: InferEnvValue<C[K]>;
    };
  }
}
