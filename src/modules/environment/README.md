# Environment

A robust, type-safe environment variable manager. It validates, parses, and provides synchronous access to your configuration variables, ensuring that your application fails fast at startup if required variables are missing.

## Why use it

- **Early Validation:** Throw errors immediately on boot instead of discovering missing variables deep in your runtime.
- **Type Safety:** Say goodbye to `process.env.IS_FEATURE_ENABLED === 'true'`. Parse strings into booleans, numbers, arrays, or objects directly at load time.
- **Synchronous Execution:** The `createEnvironment` factory loads `.env` files synchronously and processes the config blockively. No async `await initEnv()` required in your top-level files.
- **Singleton Pattern:** Configured to share one validated environment instance across your entire module dependency tree.

## CLI: `setup-environment`

This package includes a CLI that fetches secrets from AWS Secrets Manager, merges them into runtime environment variables, and then executes your app command in the same process tree.

```bash
setup-environment [--secret-name <name> | --secret-names <name1,name2>] [--write-to <path>] [--] <command> [args...]
```

- `secret names`: `--secret-name`, `--secret-names`, `SECRET_NAMES`, or `SECRET_NAME`
- dotenv loading: `.env`, `.env.development`, and `.env.local` are loaded before resolving secret names
- Secret selector precedence: `SECRET_NAMES`, then `SECRET_NAME`, then CLI `--secret-names` / `--secret-name`
- `region`: uses `AWS_REGION` from the current environment
- `--secret-names`: accepts comma-separated secret names/ARNs
- `--write-to`: writes fetched secrets as dotenv content to a file and skips command execution
- Precedence: local environment variables override secret values
- Secret merge order: left to right, then local env override
- Failure mode: fail fast (non-zero exit) if secret fetch/validation fails

### Startup script pattern

Use `setup-environment -- <command>` so your app inherits the merged environment:

```json
{
  "scripts": {
    "start": "setup-environment --secret-names prod/base,prod/web -- next start"
  }
}
```

`setup-environment && next start` will not work for propagating environment values between commands.

To write secrets to a file instead of starting a process:

```bash
setup-environment --secret-names prod/base,prod/web --write-to .env.production
```

## Usage

### Creating a custom environment

Define your environment specification. Pass a `parse` function to transform strings into correct types.

```typescript
import { createEnvironment } from 'http_js';

const config = {
  NODE_ENV: { required: false, defaultValue: 'development' },
  PORT: {
    required: true,
    parse: (val) => parseInt(val, 10),
  },
  FEATURE_FLAG: {
    required: false,
    defaultValue: false,
    parse: (val) => val === 'true',
  },
  API_KEYS: {
    required: true,
    parse: (val) => val.split(','),
  },
} as const;

// Create a globally shared singleton
export const useEnv = createEnvironment(config, { isSingleton: true });
```

### Access variables synchronously

Because validation and parsing happened during initialization, `useEnv()` returns a strictly typed object that is guaranteed to be correct.

```typescript
// useEnv() returns exactly:
// { NODE_ENV: string, PORT: number, FEATURE_FLAG: boolean, API_KEYS: string[] }

const env = useEnv();

console.log(env.PORT); // typed as number
console.log(env.API_KEYS); // typed as string[]
```

## How it works

1. **Local env vars** are read from `process.env` (or a custom callback).
   - By default, `.env`, `.env.development`, and `.env.local` are loaded into `process.env` in that order.
   - Existing runtime vars in `process.env` always win over `.env` values unless override is explicitly enabled.
2. **Defaults** from config are applied for any missing values.
3. **Validation** runs if any `required` variable is still missing, initialization throws an error listing all missing vars.
4. **Parsing** is applied where a `parse` function is configured.

`createEnvironment` returns a synchronous getter (`envGetter()`), and performs blocking initialization at creation time.

## Config options

Each environment variable accepts:

| Option         | Type                     | Description                                                                  |
| -------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `required`     | `boolean`                | If `true`, initialization fails when the variable is missing with no default |
| `defaultValue` | `string`                 | Fallback value when the variable is not in env                               |
| `description`  | `string`                 | Documentation only -- not used at runtime                                    |
| `parse`        | `(value: string) => any` | Transform the string value (e.g., `parseInt`, `JSON.parse`)                  |

`createEnvironment` options:

| Option           | Type                                        | Description                                                                |
| ---------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| `isSingleton`    | `boolean`                                   | Reuse one global `Env` instance in-process                                 |
| `setEnvCallback` | `() => Record<string, string \| undefined>` | Sync callback for local env values (defaults to `process.env`)             |
| `loadDotEnv`     | `boolean`                                   | Load dotenv files before reading values (default: true)                    |
| `dotEnvPath`     | `string \| string[]`                        | Dotenv path(s) to load (default: `.env`, `.env.development`, `.env.local`) |
| `dotEnvOverride` | `boolean`                                   | Let dotenv override existing `process.env` values (default: false)         |

## API

| Export                     | Description                                                                     |
| -------------------------- | ------------------------------------------------------------------------------- |
| `createEnvironment`        | Factory function that initializes the configuration and returns a typed getter. |
| `Env`                      | Core class managing initialization, validation, and parsed values.              |
| `loadDotEnvFilesSync`      | Helper to load `.env` and `.env.local` files sequentially.                      |
| `EnvVarOptions`            | Type defining the shape of each variable (`required`, `defaultValue`, `parse`). |
| `CreateEnvironmentOptions` | Type for factory options (`isSingleton`, `loadDotEnv`, etc).                    |
