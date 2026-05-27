import { DEFAULT_EXPIRATION_IN_SECONDS } from './in-memory-cache';
import type { AsyncCache } from './types';

export interface AsyncRedisClient {
  delete(...keys: string[]): Promise<number>;
  decrby(key: string, amount: number): Promise<number>;
  exists(key: string): Promise<number>;
  get(key: string): Promise<string | Buffer | null>;
  incrby(key: string, amount: number): Promise<number>;
  scan(options: {
    cursor: number;
    match: string;
  }): Promise<{ cursor: number; keys: string[] }>;
  set(options: {
    name: string;
    value: string;
    ex: number;
    nx: true;
  }): Promise<string | null>;
  setex(options: {
    name: string;
    time: number;
    value: string;
  }): Promise<unknown>;
}

function deserializeValue<TValue>(value: string | Buffer): TValue {
  const normalizedValue = Buffer.isBuffer(value)
    ? value.toString('utf8')
    : value;

  try {
    return JSON.parse(normalizedValue) as TValue;
  } catch {
    return normalizedValue as TValue;
  }
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }

  return JSON.stringify(value);
}

export class RedisCache<TValue = unknown> implements AsyncCache<TValue> {
  private readonly client: AsyncRedisClient;
  private readonly prefix: string;

  public constructor(client: AsyncRedisClient, prefix = 'cache:') {
    this.client = client;
    this.prefix = prefix;
  }

  public async get(key: string): Promise<TValue | null> {
    const value = await this.client.get(this.makeKey(key));

    if (value === null) {
      return null;
    }

    return deserializeValue<TValue>(value);
  }

  public async set(
    key: string,
    value: TValue,
    expirationInSeconds = DEFAULT_EXPIRATION_IN_SECONDS,
  ): Promise<void> {
    if (value === null || value === undefined) {
      throw new Error('RedisCache: value cannot be null or undefined');
    }

    await this.client.setex({
      name: this.makeKey(key),
      time: expirationInSeconds,
      value: serializeValue(value),
    });
  }

  public async removeItem(key: string): Promise<void> {
    await this.client.delete(this.makeKey(key));
  }

  public async exists(key: string): Promise<boolean> {
    return Boolean(await this.client.exists(this.makeKey(key)));
  }

  public async clear(): Promise<void> {
    const match = `${this.prefix}*`;
    let cursor = 0;

    while (true) {
      const result = await this.client.scan({ cursor, match });
      cursor = result.cursor;

      if (result.keys.length > 0) {
        await this.client.delete(...result.keys);
      }

      if (cursor === 0) {
        break;
      }
    }
  }

  public async setWithNx(
    key: string,
    value: TValue,
    expirationInSeconds = DEFAULT_EXPIRATION_IN_SECONDS,
  ): Promise<boolean> {
    if (value === null || value === undefined) {
      throw new Error('RedisCache: value cannot be null or undefined');
    }

    const result = await this.client.set({
      name: this.makeKey(key),
      value: serializeValue(value),
      ex: expirationInSeconds,
      nx: true,
    });

    return result !== null;
  }

  public async increment(key: string, amount = 1): Promise<number> {
    return this.client.incrby(this.makeKey(key), amount);
  }

  public async decrement(key: string, amount = 1): Promise<number> {
    return this.client.decrby(this.makeKey(key), amount);
  }

  private makeKey(key: string): string {
    return `${this.prefix}${key}`;
  }
}
