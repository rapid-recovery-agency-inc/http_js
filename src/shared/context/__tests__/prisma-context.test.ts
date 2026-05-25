import {
  buildPrismaClients,
  buildPrismaContextFactory,
  buildPrismaContextMiddleware,
  type PrismaServiceContext,
} from '../prisma-context';
import type { PrismaRetryRuntime } from '../../../modules/prisma-retry/services';
import type { ExpressRequestLike, ExpressResponseLike } from '../../express/services';

const mockPrismaRuntime: PrismaRetryRuntime = {
  defineExtension: <TExtension>(ext: TExtension): TExtension => ext,
};

interface MockClient {
  url: string;
  extended: boolean;
  $extends(ext: unknown): this;
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
}

function createMockClient(url: string): MockClient {
  return {
    url,
    extended: false,
    $extends(this: MockClient): MockClient {
      return { ...this, extended: true };
    },
    $connect: async () => {},
    $disconnect: async () => {},
  };
}

describe('buildPrismaClients', () => {
  it('creates a writer client from the writer URL', () => {
    const clients = buildPrismaClients({
      prismaRuntime: mockPrismaRuntime,
      createClient: createMockClient,
      writerUrl: 'postgres://writer',
    });

    expect(clients.writer.url).toBe('postgres://writer');
  });

  it('creates reader clients for each reader URL', () => {
    const clients = buildPrismaClients({
      prismaRuntime: mockPrismaRuntime,
      createClient: createMockClient,
      writerUrl: 'postgres://writer',
      readerUrls: ['postgres://reader-a', 'postgres://reader-b'],
    });

    expect(clients.readers).toHaveLength(2);
    expect(clients.readers[0]?.url).toBe('postgres://reader-a');
    expect(clients.readers[1]?.url).toBe('postgres://reader-b');
  });

  it('returns an empty readers array when no reader URLs are provided', () => {
    const clients = buildPrismaClients({
      prismaRuntime: mockPrismaRuntime,
      createClient: createMockClient,
      writerUrl: 'postgres://writer',
    });

    expect(clients.readers).toHaveLength(0);
  });

  it('applies the retry extension to writer and reader clients', () => {
    const clients = buildPrismaClients({
      prismaRuntime: mockPrismaRuntime,
      createClient: createMockClient,
      writerUrl: 'postgres://writer',
      readerUrls: ['postgres://reader-a'],
    });

    expect(clients.writer.extended).toBe(true);
    expect(clients.readers[0]?.extended).toBe(true);
  });
});

describe('buildPrismaContextFactory', () => {
  it('returns a context with the writer client', () => {
    const clients = buildPrismaClients({
      prismaRuntime: mockPrismaRuntime,
      createClient: createMockClient,
      writerUrl: 'postgres://writer',
      readerUrls: ['postgres://reader-a'],
    });
    const factory = buildPrismaContextFactory(clients);
    const ctx = factory();

    expect(ctx.writer.url).toBe('postgres://writer');
  });

  it('returns a reader from the reader pool when readers are configured', () => {
    const clients = buildPrismaClients({
      prismaRuntime: mockPrismaRuntime,
      createClient: createMockClient,
      writerUrl: 'postgres://writer',
      readerUrls: ['postgres://reader-a'],
    });
    const factory = buildPrismaContextFactory(clients);
    const ctx = factory();

    expect(ctx.reader.url).toBe('postgres://reader-a');
  });

  it('falls back to the writer client as reader when no reader URLs are configured', () => {
    const clients = buildPrismaClients({
      prismaRuntime: mockPrismaRuntime,
      createClient: createMockClient,
      writerUrl: 'postgres://writer',
    });
    const factory = buildPrismaContextFactory(clients);
    const ctx = factory();

    expect(ctx.reader.url).toBe('postgres://writer');
  });
});

describe('buildPrismaContextMiddleware', () => {
  function createMockResponse(): ExpressResponseLike & {
    locals: Record<string, unknown>;
  } {
    return {
      locals: {},
      end: function () {
        return this;
      },
      getHeader: () => undefined,
      getHeaders: () => ({}),
      json: function () {
        return this;
      },
      on: function () {
        return this;
      },
      send: function () {
        return this;
      },
      setHeader: () => undefined,
      status: function () {
        return this;
      },
      statusCode: 200,
    };
  }

  function createMockRequest(): ExpressRequestLike {
    return {
      headers: {},
      method: 'GET',
    };
  }

  it('attaches the context to res.locals.ctx', () => {
    const clients = buildPrismaClients({
      prismaRuntime: mockPrismaRuntime,
      createClient: createMockClient,
      writerUrl: 'postgres://writer',
      readerUrls: ['postgres://reader-a'],
    });
    const middleware = buildPrismaContextMiddleware(clients);
    const res = createMockResponse();
    const next = jest.fn();

    middleware(createMockRequest(), res, next);

    const ctx = res.locals['ctx'] as PrismaServiceContext<MockClient>;
    expect(ctx.writer.url).toBe('postgres://writer');
    expect(ctx.reader.url).toBe('postgres://reader-a');
  });

  it('calls next after attaching context', () => {
    const clients = buildPrismaClients({
      prismaRuntime: mockPrismaRuntime,
      createClient: createMockClient,
      writerUrl: 'postgres://writer',
    });
    const middleware = buildPrismaContextMiddleware(clients);
    const res = createMockResponse();
    const next = jest.fn();

    middleware(createMockRequest(), res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('initialises res.locals if it is undefined', () => {
    const clients = buildPrismaClients({
      prismaRuntime: mockPrismaRuntime,
      createClient: createMockClient,
      writerUrl: 'postgres://writer',
    });
    const middleware = buildPrismaContextMiddleware(clients);
    const res: ExpressResponseLike = {
      end: function () { return this; },
      getHeader: () => undefined,
      getHeaders: () => ({}),
      json: function () { return this; },
      on: function () { return this; },
      send: function () { return this; },
      setHeader: () => undefined,
      status: function () { return this; },
      statusCode: 200,
    };
    const next = jest.fn();

    middleware(createMockRequest(), res, next);

    expect(res.locals?.['ctx']).toBeDefined();
  });
});
