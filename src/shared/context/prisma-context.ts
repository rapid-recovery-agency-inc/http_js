import {
  prismaRetryExtension,
  PRISMA_RETRIES_OPTIONS_DEFAULTS,
  type PrismaRetryRuntime,
  type RetryOptions,
} from '../../modules/prisma-retry/services';
import {
  createPrismaClients,
  selectRandomPrismaReader,
  type PrismaClients,
} from '../../modules/prisma/services';
import type {
  ExpressNextFunction,
  ExpressRequestLike,
  ExpressResponseLike,
} from '../express/services';

export interface PrismaServiceContext<TClient> {
  writer: TClient;
  reader: TClient;
}

export interface PrismaContextBuildOptions<TClient> {
  prismaRuntime: PrismaRetryRuntime;
  createClient: (url: string) => TClient;
  writerUrl: string;
  readerUrls?: string[];
  retryOptions?: Partial<RetryOptions>;
}

/**
 * Creates Prisma writer and reader clients with the prisma-retry extension applied.
 * Clients are created once and intended to be shared across requests.
 */
export function buildPrismaClients<TClient>(
  options: PrismaContextBuildOptions<TClient>,
): PrismaClients<TClient> {
  const retryExtension = prismaRetryExtension(options.prismaRuntime, {
    ...PRISMA_RETRIES_OPTIONS_DEFAULTS,
    ...options.retryOptions,
  });

  return createPrismaClients({
    writerUrl: options.writerUrl,
    ...(options.readerUrls !== undefined ? { readerUrls: options.readerUrls } : {}),
    retryExtension,
    createClient: options.createClient,
  });
}

/**
 * Returns a per-request factory that wraps pre-built Prisma clients in a
 * lightweight PrismaServiceContext. If no reader clients are configured,
 * the writer client is used as the reader.
 */
export function buildPrismaContextFactory<TClient>(
  clients: PrismaClients<TClient>,
): () => PrismaServiceContext<TClient> {
  const readers =
    clients.readers.length > 0 ? clients.readers : [clients.writer];

  return (): PrismaServiceContext<TClient> => ({
    writer: clients.writer,
    reader: selectRandomPrismaReader(readers),
  });
}

/**
 * Returns an Express middleware that creates a PrismaServiceContext per request
 * and stores it on res.locals.ctx, following the standard Express convention for
 * request-scoped middleware data.
 */
export function buildPrismaContextMiddleware<TClient>(
  clients: PrismaClients<TClient>,
): (
  request: ExpressRequestLike,
  response: ExpressResponseLike,
  next: ExpressNextFunction,
) => void {
  const factory = buildPrismaContextFactory(clients);

  return (
    _request: ExpressRequestLike,
    response: ExpressResponseLike,
    next: ExpressNextFunction,
  ): void => {
    response.locals ??= {};
    response.locals['ctx'] = factory();
    next();
  };
}
