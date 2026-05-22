import {
  applyPrismaExtension,
  cleanupPrismaClients,
  createPrismaClients,
  normalizeIdentifier,
  resolveQualifiedTableName,
  selectRandomPrismaReader,
  warmUpPrismaClients,
  type PrismaExtensibleClient,
} from '../services';

class MockPrismaClient implements PrismaExtensibleClient<string> {
  public readonly connectMock = jest.fn(async () => undefined);
  public readonly disconnectMock = jest.fn(async () => undefined);
  public readonly executeRawMock = jest.fn<Promise<number>, [string]>(
    async () => 0,
  );
  public readonly queryRawMock = jest.fn<Promise<unknown[]>, [string]>(
    async () => [] as unknown[],
  );
  public readonly extendsMock = jest.fn((extension: unknown) => extension);

  public async $connect(): Promise<void> {
    await this.connectMock();
  }

  public async $disconnect(): Promise<void> {
    await this.disconnectMock();
  }

  public async $executeRaw(statement: string): Promise<number> {
    return this.executeRawMock(statement);
  }

  public async $queryRaw<TResult>(statement: string): Promise<TResult> {
    return (await this.queryRawMock(statement)) as TResult;
  }

  public $extends<TClient>(extension: TClient): TClient {
    this.extendsMock(extension);
    return { ...this, extension } as unknown as TClient;
  }
}

describe('prisma', () => {
  it('validates identifiers and resolves qualified table names', () => {
    expect(normalizeIdentifier('request_logger')).toBe('request_logger');
    expect(resolveQualifiedTableName('request_logger', 'public')).toBe(
      'public.request_logger',
    );
    expect(() => normalizeIdentifier('bad-name', 'table name')).toThrow(
      "Prisma: invalid table name 'bad-name'",
    );
  });

  it('creates writer and reader clients from runtime urls', () => {
    const createClient = jest.fn((url: string) => ({ url }));

    const clients = createPrismaClients({
      writerUrl: 'postgresql://writer',
      readerUrls: ['postgresql://reader-a', 'postgresql://reader-b'],
      createClient,
    });

    expect(createClient).toHaveBeenCalledTimes(3);
    expect(clients.writer).toEqual({ url: 'postgresql://writer' });
    expect(clients.readers).toHaveLength(2);
  });

  it('applies optional prisma extensions when available', () => {
    const client = new MockPrismaClient();
    const extension = { name: 'retry' };

    const extended = applyPrismaExtension(
      client,
      extension,
    ) as MockPrismaClient & {
      extension: unknown;
    };

    expect(client.extendsMock).toHaveBeenCalledWith(extension);
    expect(extended.extension).toBe(extension);
  });

  it('selects a random reader and rejects empty reader lists', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9);

    expect(selectRandomPrismaReader(['a', 'b'])).toBe('b');
    expect(() => selectRandomPrismaReader([])).toThrow(
      'Prisma: reader clients cannot be empty',
    );
  });

  it('warms up and cleans up all configured clients', async () => {
    const writer = new MockPrismaClient();
    const reader = new MockPrismaClient();

    await warmUpPrismaClients({ writer, readers: [reader] });
    await cleanupPrismaClients({ writer, readers: [reader] });

    expect(writer.connectMock).toHaveBeenCalledTimes(1);
    expect(reader.connectMock).toHaveBeenCalledTimes(1);
    expect(writer.disconnectMock).toHaveBeenCalledTimes(1);
    expect(reader.disconnectMock).toHaveBeenCalledTimes(1);
  });
});
