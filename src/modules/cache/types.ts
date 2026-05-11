export interface Cache<TValue = unknown> {
  clear(): void;
  exists(key: string): boolean;
  get(key: string): TValue | null;
  removeItem(key: string): void;
  set(key: string, value: TValue, expirationInSeconds?: number): void;
}

export interface AsyncCache<TValue = unknown> {
  clear(): Promise<void>;
  exists(key: string): Promise<boolean>;
  get(key: string): Promise<TValue | null>;
  removeItem(key: string): Promise<void>;
  set(key: string, value: TValue, expirationInSeconds?: number): Promise<void>;
}
