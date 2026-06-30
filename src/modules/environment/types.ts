/**
 * Configuration options for a single environment variable
 */
export type EnvVarOptions = {
  /**
   * If true, validation will fail if this variable is missing and has no default.
   * Default is false.
   */
  required?: boolean;
  /**
   * Value to use if the environment variable is not provided.
   */
  defaultValue?: string;
  /**
   * Description for documentation purposes (optional)
   */
  description?: string;
  /**
   * Function to parse/transform the string value.
   * Example: (v) => parseInt(v, 10)
   */
  parse?: (value: string) => any;
};

/**
 * Dotenv file path(s) to load.
 */
export type DotEnvPath = string | string[];

/**
 * Type to infer the return type of a variable based on its options.
 */
export type InferEnvValue<O extends EnvVarOptions> = O['parse'] extends (
  value: string,
) => infer T
  ? O['required'] extends true
    ? T
    : O['defaultValue'] extends string
      ? T
      : T | undefined // ← fix: optional with no default can be undefined
  : O['required'] extends true
    ? string
    : O['defaultValue'] extends string
      ? string
      : string | undefined; // ← fix: optional with no default can be undefined

/**
 * Callback type for fetching environment variables.
 */
export type EnvCallback = () => Record<string, string | undefined>;

/**
 * Sync callback type for fetching environment variables.
 */
export type SyncEnvCallback = EnvCallback;

/**
 * Configuration options for the Env class constructor
 */
export type EnvConstructorOptions<C extends Record<string, EnvVarOptions>> = {
  /**
   * The environment variable configuration
   */
  config: C;
  /**
   * Optional configuration options
   */
  options?: {
    /**
     * Callback to fetch local environment variables.
     * Defaults to returning process.env if not provided.
     */
    setEnvCallback?: EnvCallback;
    /**
     * Whether dotenv files should be loaded into process.env before reading values.
     * Defaults to true.
     */
    loadDotEnv?: boolean;
    /**
     * Dotenv file path(s) to load.
     * Defaults to ['.env', '.env.development', '.env.local'].
     */
    dotEnvPath?: DotEnvPath;
    /**
     * Whether dotenv values should override existing process.env values.
     * Defaults to false.
     */
    dotEnvOverride?: boolean;
  };
};

export type CreateEnvironmentSetEnvCallback<
  C extends Record<string, EnvVarOptions>,
> = () => Partial<Record<keyof C, string | undefined>> &
  ReturnType<SyncEnvCallback>;

/**
 * Configuration options for createEnvironment.
 */
export type CreateEnvironmentOptions<C extends Record<string, EnvVarOptions>> =
  {
    /**
     * Reuse a global singleton instance for the current runtime.
     */
    isSingleton?: boolean;
    /**
     * Sync callback to fetch local env vars.
     * Defaults to process.env.
     */
    setEnvCallback?: CreateEnvironmentSetEnvCallback<C>;
    /**
     * Whether dotenv files should be loaded into process.env before reading values.
     * Defaults to true.
     */
    loadDotEnv?: boolean;
    /**
     * Dotenv file path(s) to load.
     * Defaults to ['.env', '.env.development', '.env.local'].
     */
    dotEnvPath?: DotEnvPath;
    /**
     * Whether dotenv values should override existing process.env values.
     * Defaults to false.
     */
    dotEnvOverride?: boolean;
  };
