import { DEFAULT_REQUEST_TABLE } from './constants';
import type { RequestLoggerArgs } from './types';

const TABLE_PREFIX_RE = /^[A-Za-z_][A-Za-z0-9_]*$/u;

interface QueryablePool {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

export function resolveRequestLoggerTableName(
  defaultTable: string,
  tablePrefix: string | null = null,
): string {
  if (tablePrefix === null) {
    return defaultTable;
  }

  if (!TABLE_PREFIX_RE.test(tablePrefix)) {
    throw new Error(
      `Invalid table_prefix '${tablePrefix}': must contain only letters, digits, and underscores, and must not start with a digit`,
    );
  }

  return `${tablePrefix}_${defaultTable}`;
}

export async function saveRequestLog(
  args: RequestLoggerArgs,
  tablePrefix: string | null = null,
): Promise<void> {
  if (args.path.length === 0) {
    throw new Error("saveRequestLog: 'path' is required");
  }

  const table = resolveRequestLoggerTableName(
    DEFAULT_REQUEST_TABLE,
    tablePrefix,
  );
  const pool = args.ctx.writerPool as unknown as QueryablePool;

  await pool.query(
    `
      INSERT INTO public.${table}
      (
        path, product_name, product_module, product_feature,
        product_tenant, from_cache, request_headers,
        request_body, response_headers, response_body,
        status_code, duration_ms, request_uuid
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
    [
      args.path,
      args.productName ?? null,
      args.productModule ?? null,
      args.productFeature ?? null,
      args.productTenant ?? null,
      args.fromCache,
      args.requestHeaders ?? null,
      args.requestBody ?? null,
      args.responseHeaders ?? null,
      args.responseBody ?? null,
      args.statusCode ?? null,
      args.durationMs ?? null,
      args.requestUuid ?? null,
    ],
  );
}
