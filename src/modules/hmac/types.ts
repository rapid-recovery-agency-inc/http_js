export interface HMACEnvironment {
  HMAC_HEADER_NAME: string;
  SECRETS: string[];
}

export interface HMACHeadersLike {
  get(key: string, defaultValue?: string | null): string | null | undefined;
}

export interface HMACQueryParamsLike {
  entries(): IterableIterator<[string, string]>;
}

export interface HMACRequestLike {
  body(): Promise<Uint8Array | Buffer>;
  headers: HMACHeadersLike;
  method: string;
  queryParams: HMACQueryParamsLike;
  url: string;
}

export type HMACFactoryDependency = (request: HMACRequestLike) => Promise<void>;
