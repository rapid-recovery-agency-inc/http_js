import {
  booleanField,
  createEnvironment,
  customField,
  defineEnvironment,
  integerField,
  jsonField,
  listField,
  stringField,
} from '../services';

describe('environment', () => {
  const schema = defineEnvironment({
    DEBUG: booleanField(false),
    DB_HOST: stringField('localhost'),
    DB_PORT: integerField(5432),
    DB_NAME: stringField('mydb'),
    FEATURE_FLAG: customField<'true' | 'false'>('false', (value) => {
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }

      if (typeof value === 'number') {
        return value === 1 ? 'true' : 'false';
      }

      return String(value).toLowerCase() === 'true' ? 'true' : 'false';
    }),
    REPLICA_HOSTS: listField([]),
    FEATURE_CONFIG: jsonField<{ enabled: boolean }>({ enabled: false }),
  });

  it('returns defaults before any environment is set', () => {
    const manager = createEnvironment(schema);

    expect(manager.env()).toEqual({
      DEBUG: false,
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      DB_NAME: 'mydb',
      FEATURE_FLAG: 'false',
      REPLICA_HOSTS: [],
      FEATURE_CONFIG: { enabled: false },
    });
  });

  it('coerces and layers environment values', () => {
    const manager = createEnvironment(schema);

    manager.setEnvironment({
      DEBUG: 'true',
      DB_HOST: 'prod-db.example.com',
      DB_PORT: '5433',
      FEATURE_FLAG: 1,
      REPLICA_HOSTS: 'db-1,db-2',
      FEATURE_CONFIG: '{"enabled":true}',
    });

    manager.setEnvironment({
      DB_HOST: 'secret-db.internal',
      DB_NAME: 'production',
    });

    expect(manager.env()).toEqual({
      DEBUG: true,
      DB_HOST: 'secret-db.internal',
      DB_PORT: 5433,
      DB_NAME: 'production',
      FEATURE_FLAG: 'true',
      REPLICA_HOSTS: ['db-1', 'db-2'],
      FEATURE_CONFIG: { enabled: true },
    });
  });

  it('preserves existing values when preferSetValues is enabled', () => {
    const manager = createEnvironment(schema);

    manager.setEnvironment({ DB_HOST: 'base-host' });
    manager.setEnvironment(
      { DB_HOST: 'override-host', DB_NAME: 'production' },
      { preferSetValues: true },
    );

    expect(manager.env().DB_HOST).toBe('base-host');
    expect(manager.env().DB_NAME).toBe('production');
  });

  it('validates mandatory keys on load', () => {
    const manager = createEnvironment(schema, {
      mandatoryKeys: ['DB_HOST', 'DB_PORT'],
    });

    expect(() => manager.load({ DB_HOST: 'prod-db.example.com' })).toThrow(
      'Environment is missing mandatory keys: DB_PORT',
    );
  });

  it('applies the post-set hook to the accumulated environment', () => {
    const manager = createEnvironment(schema, {
      postSetHook(environment) {
        return {
          ...environment,
          DB_NAME: environment.DB_NAME.toUpperCase(),
        };
      },
    });

    manager.setEnvironment({ DB_NAME: 'production' });

    expect(manager.env().DB_NAME).toBe('PRODUCTION');
  });

  it('throws a descriptive conversion error when coercion fails', () => {
    const manager = createEnvironment(schema);

    expect(() => manager.setEnvironment({ DB_PORT: 'not-a-number' })).toThrow(
      "Failed to convert environment key 'DB_PORT'",
    );
  });
});
