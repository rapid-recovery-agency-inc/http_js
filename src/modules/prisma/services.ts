import { createLogger, LogLevel } from '../../shared/logging/services';

const logger = createLogger('prisma', { logLevel: LogLevel.DEBUG });

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/u;

export interface PrismaStatementFactory<TStatement> {
  raw(value: string): TStatement;
  sql(strings: TemplateStringsArray, ...values: unknown[]): TStatement;
}

export interface PrismaQueryableClient<TStatement = unknown> {
  $connect?(): Promise<void>;
  $disconnect?(): Promise<void>;
  $executeRaw(statement: TStatement): Promise<number>;
  $queryRaw<TResult>(statement: TStatement): Promise<TResult>;
}

export interface PrismaExtensibleClient<
  TStatement = unknown,
> extends PrismaQueryableClient<TStatement> {
  $extends?<TClient>(extension: TClient): TClient;
}

export interface PrismaClients<TClient> {
  readers: TClient[];
  writer: TClient;
}

export interface PrismaClientFactoryOptions<TClient> {
  readerUrls?: string[];
  retryExtension?: unknown;
  writerUrl: string;
  createClient(url: string): TClient;
}

export function normalizeIdentifier(
  value: string,
  label = 'identifier',
): string {
  if (!IDENTIFIER_RE.test(value)) {
    throw new Error(`Prisma: invalid ${label} '${value}'`);
  }

  return value;
}

export function resolveQualifiedTableName(
  tableName: string,
  schemaName: string | null = null,
): string {
  const normalizedTableName = normalizeIdentifier(tableName, 'table name');

  if (schemaName === null) {
    return normalizedTableName;
  }

  return `${normalizeIdentifier(schemaName, 'schema name')}.${normalizedTableName}`;
}

export function applyPrismaExtension<TClient>(
  client: TClient,
  retryExtension: unknown,
): TClient {
  if (
    retryExtension === undefined ||
    retryExtension === null ||
    typeof client !== 'object' ||
    client === null ||
    !('$extends' in client) ||
    typeof client.$extends !== 'function'
  ) {
    return client;
  }

  return client.$extends(retryExtension) as TClient;
}

export function createPrismaClients<TClient>(
  options: PrismaClientFactoryOptions<TClient>,
): PrismaClients<TClient> {
  const writer = applyPrismaExtension(
    options.createClient(options.writerUrl),
    options.retryExtension,
  );
  const readers = (options.readerUrls ?? [])
    .filter((value) => value.trim().length > 0)
    .map((url) =>
      applyPrismaExtension(options.createClient(url), options.retryExtension),
    );

  return {
    writer,
    readers,
  };
}

export function selectRandomPrismaReader<TClient>(readers: TClient[]): TClient {
  if (readers.length === 0) {
    throw new Error('Prisma: reader clients cannot be empty');
  }

  return readers[Math.floor(Math.random() * readers.length)] as TClient;
}

export async function warmUpPrismaClients<TClient>(
  clients: PrismaClients<TClient>,
): Promise<void> {
  const allClients = [clients.writer, ...clients.readers];

  logger.info('Opening prisma clients', { clientCount: allClients.length });

  await Promise.all(
    allClients.map(async (client) => {
      if (
        typeof client === 'object' &&
        client !== null &&
        '$connect' in client &&
        typeof client.$connect === 'function'
      ) {
        await client.$connect();
      }
    }),
  );
}

export async function cleanupPrismaClients<TClient>(
  clients: PrismaClients<TClient>,
): Promise<void> {
  const allClients = [clients.writer, ...clients.readers];

  await Promise.all(
    allClients.map(async (client) => {
      if (
        typeof client === 'object' &&
        client !== null &&
        '$disconnect' in client &&
        typeof client.$disconnect === 'function'
      ) {
        await client.$disconnect();
      }
    }),
  );
}
