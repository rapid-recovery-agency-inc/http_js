import type { ContextRequestLike } from '../../shared/context/services.js';
import type { PostgresPool } from '../../shared/postgres/services.js';

export interface RequestLoggerContextLike {
  writerPool: PostgresPool;
}

export interface RequestLoggerOverride {
  productFeature?: string | null;
  productModule?: string | null;
  productName?: string | null;
  productTenant?: string | null;
  requestBody?: string | null;
  requestHeaders?: string | null;
}

export interface RequestLoggerArgs {
  ctx: RequestLoggerContextLike;
  durationMs?: number | null;
  fromCache: boolean;
  path: string;
  productFeature?: string | null;
  productModule?: string | null;
  productName?: string | null;
  productTenant?: string | null;
  requestBody?: string | null;
  requestHeaders?: string | null;
  requestUuid?: string | null;
  responseBody?: string | null;
  responseHeaders?: string | null;
  statusCode?: number | null;
}

export interface RequestLoggerResponseLike {
  body?: string;
  headers: Record<string, string>;
  statusCode: number;
}

export type RequestLoggerNext = (
  request: ContextRequestLike,
) => Promise<RequestLoggerResponseLike>;
