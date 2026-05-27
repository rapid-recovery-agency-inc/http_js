import { createHash } from 'node:crypto';

import {
  type PrismaQueryableClient,
  type PrismaStatementFactory,
  resolveQualifiedTableName,
} from '../prisma/services';

export interface CacheRecord {
  expiresAt: number | null;
  value: string;
}

export interface CacheRepository<TValue = unknown> {
  cleanupExpired(): Promise<number>;
  clear(): Promise<void>;
  exists(key: string): Promise<boolean>;
  find(key: string): Promise<CacheRecord | null>;
  remove(key: string): Promise<void>;
  upsert(
    key: string,
    value: TValue,
    expirationInSeconds: number,
  ): Promise<void>;
}

export interface PrismaCacheRepositoryOptions<TStatement> {
  client: PrismaQueryableClient<TStatement>;
  schemaName?: string | null;
  sql: PrismaStatementFactory<TStatement>;
  tableName?: string;
}

interface CacheRow {
  expires_at: number | null;
  value: string;
}

function hashKey(key: string): Buffer {
  return createHash('sha256').update(key, 'utf8').digest();
}

export class PrismaCacheRepository<
  TValue = unknown,
  TStatement = unknown,
> implements CacheRepository<TValue> {
  private readonly client: PrismaQueryableClient<TStatement>;
  private readonly qualifiedTableName: string;
  private readonly sql: PrismaStatementFactory<TStatement>;

  public constructor(options: PrismaCacheRepositoryOptions<TStatement>) {
    this.client = options.client;
    this.sql = options.sql;
    this.qualifiedTableName = resolveQualifiedTableName(
      options.tableName ?? 'cache',
      options.schemaName ?? 'public',
    );
  }

  public async find(key: string): Promise<CacheRecord | null> {
    const rows = await this.client.$queryRaw<CacheRow[]>(
      this.sql.sql`
        SELECT value, expires_at
        FROM ${this.sql.raw(this.qualifiedTableName)}
        WHERE key = ${hashKey(key)}
        LIMIT 1
      `,
    );

    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    return {
      value: row.value,
      expiresAt: row.expires_at,
    };
  }

  public async upsert(
    key: string,
    value: TValue,
    expirationInSeconds: number,
  ): Promise<void> {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = nowInSeconds + expirationInSeconds;
    const serializedValue =
      typeof value === 'string' ? value : JSON.stringify(value);

    await this.client.$executeRaw(
      this.sql.sql`
        INSERT INTO ${this.sql.raw(this.qualifiedTableName)}
          (key, plain_key, value, expires_at)
        VALUES (${hashKey(key)}, ${key}, ${serializedValue}, ${expiresAt})
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `,
    );
  }

  public async remove(key: string): Promise<void> {
    await this.client.$executeRaw(
      this.sql.sql`
        DELETE FROM ${this.sql.raw(this.qualifiedTableName)}
        WHERE key = ${hashKey(key)}
      `,
    );
  }

  public async exists(key: string): Promise<boolean> {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const rows = await this.client.$queryRaw<Array<{ present: number }>>(
      this.sql.sql`
        SELECT 1 AS present
        FROM ${this.sql.raw(this.qualifiedTableName)}
        WHERE key = ${hashKey(key)}
          AND (expires_at IS NULL OR expires_at > ${nowInSeconds})
        LIMIT 1
      `,
    );

    return rows.length > 0;
  }

  public async clear(): Promise<void> {
    await this.client.$executeRaw(
      this.sql.sql`TRUNCATE TABLE ${this.sql.raw(this.qualifiedTableName)}`,
    );
  }

  public async cleanupExpired(): Promise<number> {
    const nowInSeconds = Math.floor(Date.now() / 1000);

    return this.client.$executeRaw(
      this.sql.sql`
        DELETE FROM ${this.sql.raw(this.qualifiedTableName)}
        WHERE expires_at IS NOT NULL AND expires_at <= ${nowInSeconds}
      `,
    );
  }
}
