import {
  resolveQualifiedTableName,
  type PrismaQueryableClient,
  type PrismaStatementFactory,
} from '../prisma/services';

import { DEFAULT_REQUEST_TABLE } from './constants';
import type { RequestLogRecord, RequestLoggerPersistenceLike } from './types';
import { resolveRequestLoggerTableName } from './utils';

export interface PrismaRequestLoggerRepositoryOptions<TStatement> {
  client: PrismaQueryableClient<TStatement>;
  schemaName?: string | null;
  sql: PrismaStatementFactory<TStatement>;
  tableName?: string;
}

export class PrismaRequestLoggerRepository<
  TStatement = unknown,
> implements RequestLoggerPersistenceLike {
  private readonly client: PrismaQueryableClient<TStatement>;
  private readonly schemaName: string | null;
  private readonly sql: PrismaStatementFactory<TStatement>;
  private readonly tableName: string;

  public constructor(
    options: PrismaRequestLoggerRepositoryOptions<TStatement>,
  ) {
    this.client = options.client;
    this.schemaName = options.schemaName ?? 'public';
    this.sql = options.sql;
    this.tableName = options.tableName ?? DEFAULT_REQUEST_TABLE;
  }

  public async save(
    entry: RequestLogRecord,
    tablePrefix: string | null = null,
  ): Promise<void> {
    const qualifiedTableName = resolveQualifiedTableName(
      resolveRequestLoggerTableName(this.tableName, tablePrefix),
      this.schemaName,
    );

    await this.client.$executeRaw(
      this.sql.sql`
        INSERT INTO ${this.sql.raw(qualifiedTableName)}
        (
          path, product_name, product_module, product_feature,
          product_tenant, from_cache, request_headers,
          request_body, response_headers, response_body,
          status_code, duration_ms, request_uuid
        )
        VALUES (
          ${entry.path},
          ${entry.productName ?? null},
          ${entry.productModule ?? null},
          ${entry.productFeature ?? null},
          ${entry.productTenant ?? null},
          ${entry.fromCache},
          ${entry.requestHeaders ?? null},
          ${entry.requestBody ?? null},
          ${entry.responseHeaders ?? null},
          ${entry.responseBody ?? null},
          ${entry.statusCode ?? null},
          ${entry.durationMs ?? null},
          ${entry.requestUuid ?? null}
        )
      `,
    );
  }
}
