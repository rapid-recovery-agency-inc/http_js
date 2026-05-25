import { DEFAULT_REQUEST_TABLE } from './constants';
import type { RequestLoggerArgs } from './types';

const TABLE_PREFIX_RE = /^[A-Za-z_][A-Za-z0-9_]*$/u;

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

  resolveRequestLoggerTableName(DEFAULT_REQUEST_TABLE, tablePrefix);

  const { ctx, ...entry } = args;

  await ctx.writer.save(entry, tablePrefix);
}
