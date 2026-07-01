export interface HMACEnvironment {
  HMAC_HEADER_NAME: string;
  SECRETS: string[];
}

export type HmacHeaderValue = boolean | null | number | string | undefined;

export type HmacHeadersInput =
  | Headers
  | readonly (readonly [string, HmacHeaderValue])[]
  | Record<
      string,
      HmacHeaderValue | readonly HmacHeaderValue[] | HmacHeaderValue[]
    >;

export interface HmacCustomHeaderRule {
  name: string;
  validate(value: string, headers: Readonly<Record<string, string>>): boolean;
}

export interface HmacRequestInput {
  body?: Buffer | string | Uint8Array;
  headers?: HmacHeadersInput;
  method: string;
  params?: Readonly<Record<string, unknown>>;
  url: string;
}

export type HmacSecretResolver = () => Promise<readonly string[]>;

interface HmacClientSharedOptions {
  customHeaders?: readonly HmacCustomHeaderRule[];
  signatureHeader?: string;
}

export type HmacClientOptions = HmacClientSharedOptions &
  (
    | {
        resolveSecrets?: never;
        secrets: readonly string[];
      }
    | {
        resolveSecrets: HmacSecretResolver;
        secrets?: never;
      }
  );

export interface HmacClientInstance {
  readonly signatureHeader: string;
  sign(input: HmacRequestInput): Promise<string>;
  verify(signature: string, input: HmacRequestInput): Promise<void>;
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
