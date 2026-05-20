# Environment

Schema-driven environment loading with typed field definitions, runtime coercion, and mandatory-key validation. Replaces hand-written `process.env` access with a single validated environment object.

## Why use it

- Catches missing or malformed environment variables at startup, not at the call site.
- Each field declares its own type coercion — no scattered `parseInt` / `JSON.parse` calls.
- The `EnvironmentManager` caches the parsed result so loading only happens once.
- Supports post-set hooks for cross-field validation or derived values.

## Defining an environment schema

```typescript
import {
  defineEnvironment,
  stringField,
  integerField,
  booleanField,
  listField,
  floatField,
  jsonField,
  customField,
} from 'http_js';

const schema = defineEnvironment({
  PORT: integerField(3000),
  HOST: stringField('0.0.0.0'),
  DEBUG: booleanField(false),
  ALLOWED_ORIGINS: listField([]), // comma-separated string → string[]
  TIMEOUT_SECS: floatField(30.0),
  CONFIG: jsonField<Record<string, unknown>>({}),
  LOG_LEVEL: customField('INFO', (v) => String(v).toUpperCase()),
});
```

## Loading the environment

```typescript
import { createEnvironment } from 'http_js';

const { manager } = createEnvironment(schema, {
  mandatoryKeys: ['PORT', 'HOST'],
});

// Reads from process.env by default
const env = manager.getEnvironment();

console.log(env.PORT); // number
console.log(env.DEBUG); // boolean
```

## Using EnvironmentManager directly

```typescript
import { EnvironmentManager } from 'http_js';

const manager = new EnvironmentManager(schema, { mandatoryKeys: ['HOST'] });

// Set from an arbitrary object (e.g. AWS Secrets)
manager.setEnvironment({ HOST: 'db.internal', PORT: '5432' });

const env = manager.getEnvironment();
```

## Inferring the environment type

```typescript
import type { InferEnvironment } from 'http_js';

type AppEnv = InferEnvironment<typeof schema>;
// { readonly PORT: number; readonly HOST: string; readonly DEBUG: boolean; ... }
```

## API

| Export                  | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| `defineEnvironment`     | Creates a typed schema object from field definitions           |
| `createEnvironment`     | Builds an `EnvironmentManager` from a schema                   |
| `EnvironmentManager`    | Class that loads, coerces, and caches the environment          |
| `stringField`           | Field that coerces the value to a string                       |
| `integerField`          | Field that coerces the value to an integer                     |
| `floatField`            | Field that coerces the value to a float                        |
| `booleanField`          | Field that coerces truthy strings (`true`, `1`, `yes`) to bool |
| `listField`             | Field that splits a comma-separated string into `string[]`     |
| `jsonField`             | Field that JSON-parses the value                               |
| `customField`           | Field with a user-supplied coercion function                   |
| `EnvironmentField`      | Interface for defining a custom field                          |
| `EnvironmentSchema`     | Type for the schema object passed to `defineEnvironment`       |
| `InferEnvironment`      | Utility type: schema → typed environment shape                 |
| `SetEnvironmentOptions` | Options for `manager.setEnvironment()`                         |
