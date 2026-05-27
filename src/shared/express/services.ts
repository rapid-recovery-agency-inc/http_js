import type { ContextState } from '../context/services';
import type { QueryParamsLike } from '../requests/services';

type ExpressHeaderValue = number | string | string[] | undefined;

export interface ExpressRequestLike {
  body?: unknown;
  headers: Record<string, ExpressHeaderValue>;
  method: string;
  originalUrl?: string;
  path?: string;
  query?: Record<string, unknown>;
  state?: ContextState;
}

export interface ExpressResponseLike {
  end(body?: unknown): ExpressResponseLike;
  getHeader(name: string): unknown;
  getHeaders(): Record<string, unknown>;
  json(body: unknown): ExpressResponseLike;
  locals?: Record<string, unknown>;
  on(event: 'close' | 'finish', listener: () => void): ExpressResponseLike;
  send(body?: unknown): ExpressResponseLike;
  setHeader(name: string, value: number | string | readonly string[]): void;
  status(code: number): ExpressResponseLike;
  statusCode: number;
}

export type ExpressNextFunction = (error?: unknown) => void;

export type ExpressMiddleware = (
  request: ExpressRequestLike,
  response: ExpressResponseLike,
  next: ExpressNextFunction,
) => void | Promise<void>;

class ExpressHeadersAdapter {
  public constructor(
    private readonly headers: Record<string, ExpressHeaderValue>,
  ) {}

  public toString(): string {
    return JSON.stringify(this.headers);
  }
}

class ExpressQueryParamsAdapter implements QueryParamsLike {
  public constructor(private readonly query: Record<string, unknown>) {}

  public get(key: string): string | null {
    const value = this.query[key];

    if (value === undefined || value === null) {
      return null;
    }

    if (Array.isArray(value)) {
      return value.length === 0 ? null : String(value[0]);
    }

    return String(value);
  }
}

function stringifyRequestBody(body: unknown): string {
  if (body === null || body === undefined) {
    return '';
  }

  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString('utf8');
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body).toString('utf8');
  }

  return JSON.stringify(body);
}

export function stringifyExpressBody(body: unknown): string {
  return stringifyRequestBody(body);
}

function resolveRequestPath(request: ExpressRequestLike): string {
  if (request.path !== undefined && request.path.length > 0) {
    return request.path;
  }

  if (request.originalUrl !== undefined && request.originalUrl.length > 0) {
    return request.originalUrl.split('?')[0] ?? request.originalUrl;
  }

  return '/';
}

export function ensureExpressRequestState(
  request: ExpressRequestLike,
): ContextState {
  request.state ??= {};
  return request.state;
}

export function createContextRequestFromExpress(request: ExpressRequestLike): {
  headers: ExpressHeadersAdapter;
  method: string;
  queryParams: QueryParamsLike;
  state: ContextState;
  text(): Promise<string>;
  url: { path: string };
} {
  const state = ensureExpressRequestState(request);
  const query = request.query ?? {};

  return {
    headers: new ExpressHeadersAdapter(request.headers),
    method: request.method,
    queryParams: new ExpressQueryParamsAdapter(query),
    state,
    async text(): Promise<string> {
      return stringifyRequestBody(request.body);
    },
    url: {
      path: resolveRequestPath(request),
    },
  };
}

export function normalizeExpressHeaders(
  headers: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(', ') : String(value),
    ]),
  );
}

export function hasExpressHeader(
  response: ExpressResponseLike,
  headerName: string,
): boolean {
  const directValue = response.getHeader(headerName);
  if (directValue !== undefined) {
    return true;
  }

  const expectedKey = headerName.toLowerCase();
  return Object.keys(response.getHeaders()).some(
    (key) => key.toLowerCase() === expectedKey,
  );
}
