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

// ---------------------------------------------------------------------------
// Client-side types (used by HmacClient / createHmacClient)
// ---------------------------------------------------------------------------

export type HmacClientOptions = {
  secretName: string;
  signatureHeader?: string;
  customHeaders?: HmacCustomHeaderRule[];
  awsRegion?: string;
};

export type HmacRequestInput = {
  method: string;
  url: string;
  params?: Record<string, string | number | boolean>;
  body?: string | Buffer;
  headers?: HmacHeadersInput;
};

export type HmacCustomHeaderRule = {
  name: string;
  validate: (
    value: string,
    headers: Readonly<Record<string, string>>,
  ) => boolean;
};

export type HmacHeaderValue = string | number | boolean | null | undefined;

export type HmacHeadersInput =
  | Headers
  | Array<[string, HmacHeaderValue]>
  | ReadonlyArray<readonly [string, HmacHeaderValue]>
  | Record<
      string,
      HmacHeaderValue | HmacHeaderValue[] | readonly HmacHeaderValue[]
    >;

/**
 * Public contract returned by `createHmacClient`.
 *
 * Decouples consumers from the internal `HmacClient` class so the
 * implementation can evolve without breaking the public API.
 */
export interface HmacClientInstance {
  /** Header name used to carry the HMAC signature. */
  readonly signatureHeader: string;

  /** Sign a request and return the hex-encoded HMAC digest. */
  sign(input: HmacRequestInput): Promise<string>;

  /** Verify a signature against a request. Rejects with `HMACException` on mismatch. */
  verify(signature: string, input: HmacRequestInput): Promise<void>;
}
