import type { ServiceContext } from '../../shared/context/services';

export interface RequestLogRecord {
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

export interface RequestLoggerPersistenceLike {
  save(entry: RequestLogRecord, tablePrefix?: string | null): Promise<void>;
}

export type RequestLoggerContextLike = ServiceContext<
  RequestLoggerPersistenceLike,
  RequestLoggerPersistenceLike
>;

export interface RequestLoggerOverride {
  productFeature?: string | null;
  productModule?: string | null;
  productName?: string | null;
  productTenant?: string | null;
  requestBody?: string | null;
  requestHeaders?: string | null;
}

export interface RequestLoggerArgs extends RequestLogRecord {
  ctx: RequestLoggerContextLike;
}
