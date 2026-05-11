import { createHash } from 'node:crypto';

import type { PostgresPool } from '../../shared/postgres/services.js';

import { DEFAULT_EXPIRATION_IN_SECONDS } from './in-memory-cache.js';
import type { AsyncCache } from './types.js';

interface QueryablePostgresPool {
  query<TValue = unknown>(
    text: string,
    values?: unknown[],
  ): Promise<{ rowCount: number | null; rows: TValue[] }>;
}

interface CacheRow {
  expires_at: number | null;
  value: string;
}

function hashKey(key: string): Buffer {
  return createHash('sha256').update(key, 'utf8').digest();
}

function normalizeTableName(tableName: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(tableName)) {
    throw new Error(`DatabaseCache: invalid table name '${tableName}'`);
  }

  return tableName;
}

function parseCachedValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    return rawValue;
  }
}

export class DatabaseCache<TValue = unknown> implements AsyncCache<TValue> {
  private readonly pool: QueryablePostgresPool;
  private readonly tableName: string;

  public constructor(pool: PostgresPool, tableName = 'cache') {
    this.pool = pool as unknown as QueryablePostgresPool;
    this.tableName = normalizeTableName(tableName);
  }

  public async get(key: string): Promise<TValue | null> {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const result = await this.pool.query<CacheRow>(
      `
        SELECT value, expires_at
        FROM public.${this.tableName}
        WHERE key = $1
        LIMIT 1
      `,
      [hashKey(key)],
    );

    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }

    if (row.expires_at !== null && nowInSeconds >= row.expires_at) {
      await this.removeItem(key);
      return null;
    }

    return parseCachedValue(row.value) as TValue;
  }

  public async set(
    key: string,
    value: TValue,
    expirationInSeconds = DEFAULT_EXPIRATION_IN_SECONDS,
  ): Promise<void> {
    if (value === null || value === undefined) {
      throw new Error('DatabaseCache: value cannot be null or undefined');
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = nowInSeconds + expirationInSeconds;
    const serializedValue =
      typeof value === 'string' ? value : JSON.stringify(value);

    await this.pool.query(
      `
        INSERT INTO public.${this.tableName} (key, plain_key, value, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `,
      [hashKey(key), key, serializedValue, expiresAt],
    );
  }

  public async removeItem(key: string): Promise<void> {
    await this.pool.query(
      `
        DELETE FROM public.${this.tableName}
        WHERE key = $1
      `,
      [hashKey(key)],
    );
  }

  public async exists(key: string): Promise<boolean> {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const result = await this.pool.query(
      `
        SELECT 1
        FROM public.${this.tableName}
        WHERE key = $1
          AND (expires_at IS NULL OR expires_at > $2)
        LIMIT 1
      `,
      [hashKey(key), nowInSeconds],
    );

    return (result.rowCount ?? 0) > 0;
  }

  public async clear(): Promise<void> {
    await this.pool.query(`TRUNCATE TABLE public.${this.tableName}`);
  }

  public async cleanupExpired(): Promise<number> {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const result = await this.pool.query(
      `
        DELETE FROM public.${this.tableName}
        WHERE expires_at IS NOT NULL AND expires_at <= $1
      `,
      [nowInSeconds],
    );

    return result.rowCount ?? 0;
  }
}
