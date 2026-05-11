export interface EnvironmentField<TValue> {
  defaultValue: TValue;
  convert(value: unknown): TValue;
}

export type EnvironmentSchema = Record<string, EnvironmentField<unknown>>;

export type InferEnvironment<TSchema extends EnvironmentSchema> = {
  readonly [TKey in keyof TSchema]: TSchema[TKey] extends EnvironmentField<
    infer TValue
  >
    ? TValue
    : never;
};

export interface SetEnvironmentOptions {
  preferSetValues?: boolean;
  validateValues?: boolean;
}

interface CreateEnvironmentOptions<TSchema extends EnvironmentSchema> {
  mandatoryKeys?: Array<Extract<keyof TSchema, string>>;
  postSetHook?: (
    environment: InferEnvironment<TSchema>,
  ) => InferEnvironment<TSchema>;
}

type RawEnvironment = Record<string, unknown>;

function toEnvironmentError(
  message: string,
  key: string,
  value: unknown,
): Error {
  const printableValue =
    typeof value === 'string' ? value : JSON.stringify(value);
  return new Error(
    `Failed to convert environment key '${key}' with value '${printableValue}': ${message}`,
  );
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  throw new Error('Expected a boolean-compatible value.');
}

function parseInteger(value: unknown): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    throw new Error('Expected an integer-compatible value.');
  }
  return parsed;
}

function parseFloatValue(value: unknown): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (Number.isNaN(parsed)) {
    throw new Error('Expected a float-compatible value.');
  }
  return parsed;
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  throw new Error('Expected a list-compatible value.');
}

function parseJson<TValue>(value: unknown): TValue {
  if (typeof value === 'string') {
    return JSON.parse(value) as TValue;
  }

  return value as TValue;
}

export function stringField(defaultValue = ''): EnvironmentField<string> {
  return {
    defaultValue,
    convert(value: unknown): string {
      return typeof value === 'string' ? value : String(value);
    },
  };
}

export function booleanField(defaultValue = false): EnvironmentField<boolean> {
  return {
    defaultValue,
    convert: parseBoolean,
  };
}

export function integerField(defaultValue = 0): EnvironmentField<number> {
  return {
    defaultValue,
    convert: parseInteger,
  };
}

export function floatField(defaultValue = 0): EnvironmentField<number> {
  return {
    defaultValue,
    convert: parseFloatValue,
  };
}

export function listField(
  defaultValue: string[] = [],
): EnvironmentField<string[]> {
  return {
    defaultValue,
    convert: parseList,
  };
}

export function jsonField<TValue>(
  defaultValue: TValue,
): EnvironmentField<TValue> {
  return {
    defaultValue,
    convert(value: unknown): TValue {
      return parseJson<TValue>(value);
    },
  };
}

export function customField<TValue>(
  defaultValue: TValue,
  convert: (value: unknown) => TValue,
): EnvironmentField<TValue> {
  return {
    defaultValue,
    convert,
  };
}

export function defineEnvironment<TSchema extends EnvironmentSchema>(
  schema: TSchema,
): TSchema {
  return schema;
}

function buildDefaults<TSchema extends EnvironmentSchema>(
  schema: TSchema,
): InferEnvironment<TSchema> {
  const entries = Object.entries(schema).map(([key, field]) => [
    key,
    field.defaultValue,
  ]);
  return Object.freeze(
    Object.fromEntries(entries),
  ) as InferEnvironment<TSchema>;
}

function coerceEnvironment<TSchema extends EnvironmentSchema>(
  schema: TSchema,
  raw: RawEnvironment,
): Partial<InferEnvironment<TSchema>> {
  const coercedEntries = Object.entries(schema)
    .filter(([key]) => raw[key] !== undefined)
    .map(([key, field]) => {
      const rawValue = raw[key];

      try {
        return [key, field.convert(rawValue)];
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown conversion failure.';
        throw toEnvironmentError(message, key, rawValue);
      }
    });

  return Object.fromEntries(coercedEntries) as Partial<
    InferEnvironment<TSchema>
  >;
}

function validateKeys(raw: RawEnvironment, mandatoryKeys: string[]): void {
  const missingKeys = mandatoryKeys.filter((key) => raw[key] === undefined);
  if (missingKeys.length > 0) {
    throw new Error(
      `Environment is missing mandatory keys: ${missingKeys.join(', ')}`,
    );
  }
}

export class EnvironmentManager<TSchema extends EnvironmentSchema> {
  private readonly defaults: InferEnvironment<TSchema>;
  private readonly mandatoryKeys: string[];
  private readonly postSetHook:
    | ((environment: InferEnvironment<TSchema>) => InferEnvironment<TSchema>)
    | undefined;
  private readonly schema: TSchema;

  private state: Partial<InferEnvironment<TSchema>> = {};

  public constructor(
    schema: TSchema,
    options: CreateEnvironmentOptions<TSchema> = {},
  ) {
    this.schema = schema;
    this.defaults = buildDefaults(schema);
    this.mandatoryKeys = options.mandatoryKeys ?? [];
    this.postSetHook = options.postSetHook;
  }

  public env(): InferEnvironment<TSchema> {
    return Object.freeze({
      ...this.defaults,
      ...this.state,
    }) as InferEnvironment<TSchema>;
  }

  public setEnvironment(
    raw: RawEnvironment,
    options: SetEnvironmentOptions = {},
  ): void {
    const coerced = coerceEnvironment(this.schema, raw);

    if (options.preferSetValues === true) {
      for (const [key, value] of Object.entries(coerced) as Array<
        [
          Extract<keyof InferEnvironment<TSchema>, string>,
          InferEnvironment<TSchema>[keyof InferEnvironment<TSchema>],
        ]
      >) {
        if (this.state[key] === undefined) {
          this.state[key] = value;
        }
      }
    } else {
      this.state = {
        ...this.state,
        ...coerced,
      };
    }

    if (this.postSetHook !== undefined) {
      this.state = { ...this.postSetHook(this.env()) };
    }
  }

  public load(raw: RawEnvironment): void {
    validateKeys(raw, this.mandatoryKeys);
    this.setEnvironment(raw);
  }
}

export function createEnvironment<TSchema extends EnvironmentSchema>(
  schema: TSchema,
  options: CreateEnvironmentOptions<TSchema> = {},
): EnvironmentManager<TSchema> {
  return new EnvironmentManager(schema, options);
}
