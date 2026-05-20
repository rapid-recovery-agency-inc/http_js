import {
  PRISMA_RETRIES_OPTIONS_DEFAULTS,
  PrismaRetryTimeoutError,
  RETRYABLE_ERROR_CODES,
  calculateDelay,
  createTimeoutPromise,
  executeWithTimeout,
  prismaRetryExtension,
  shouldRetry,
  type PrismaRetryRuntime,
} from '../services';
import * as sleepModule from '../../../shared/utils/sleep';

class MockKnownRequestError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'MockKnownRequestError';
    this.code = code;
  }
}

class MockValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MockValidationError';
  }
}

function createPrismaRuntime(): PrismaRetryRuntime {
  return {
    defineExtension: <TExtension>(extension: TExtension) => extension,
    PrismaClientKnownRequestError: MockKnownRequestError,
    PrismaClientValidationError: MockValidationError,
  };
}

describe('prisma-retry', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('applies exponential backoff with jitter', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(calculateDelay(2, 100, 40)).toBe(420);
  });

  it('marks timeout, retryable codes, and transient messages as retryable', () => {
    const timeoutError = new PrismaRetryTimeoutError('timed out');
    const retryableCode = [...RETRYABLE_ERROR_CODES][0] ?? 'P1001';

    expect(shouldRetry(timeoutError)).toBe(true);
    expect(
      shouldRetry(
        new Error('Database connection timeout while starting query'),
      ),
    ).toBe(true);
    expect(shouldRetry({ code: retryableCode })).toBe(true);
  });

  it('does not retry Prisma validation errors', () => {
    const prisma = createPrismaRuntime();

    expect(
      shouldRetry(new MockValidationError('Invalid where clause'), prisma),
    ).toBe(false);
  });

  it('creates a cancellable timeout promise', async () => {
    jest.useFakeTimers();

    const { promise, cancel } = createTimeoutPromise(25, 'User.findMany');
    const rejection = expect(promise).rejects.toThrow(
      "Operation 'User.findMany' timed out after 25ms",
    );

    jest.advanceTimersByTime(25);
    await rejection;

    cancel();
  });

  it('wraps an operation with a timeout', async () => {
    jest.useFakeTimers();

    const pendingQuery = new Promise<string>((resolve) => {
      setTimeout(() => resolve('late-result'), 50);
    });

    const resultPromise = executeWithTimeout(pendingQuery, 10, 'User.findMany');
    jest.advanceTimersByTime(10);

    await expect(resultPromise).rejects.toThrow(PrismaRetryTimeoutError);
  });

  it('retries model operations until the query succeeds', async () => {
    const prisma = createPrismaRuntime();
    jest.spyOn(sleepModule, 'msleep').mockResolvedValue(undefined);

    const extension = prismaRetryExtension(prisma, {
      ...PRISMA_RETRIES_OPTIONS_DEFAULTS,
      maxAttempts: 3,
      baseDelay: 1,
      jitter: 0,
    });

    const query = jest
      .fn<Promise<string>, [Record<string, unknown>]>()
      .mockRejectedValueOnce(new Error('connection timeout from database'))
      .mockResolvedValueOnce('ok');

    const result = await extension.query.$allModels.$allOperations({
      operation: 'findMany',
      model: 'User',
      args: { where: { active: true } },
      query,
    });

    expect(result).toBe('ok');
    expect(query).toHaveBeenCalledTimes(2);
    expect(sleepModule.msleep).toHaveBeenCalledTimes(1);
  });

  it('fails fast for non-retryable top-level operations', async () => {
    const prisma = createPrismaRuntime();
    jest.spyOn(sleepModule, 'msleep').mockResolvedValue(undefined);

    const extension = prismaRetryExtension(prisma, {
      maxAttempts: 3,
      baseDelay: 1,
      jitter: 0,
    });

    const error = new Error('not retryable');
    const query = jest
      .fn<Promise<never>, [Record<string, unknown>]>()
      .mockRejectedValue(error);

    await expect(
      extension.query.$allOperations({
        operation: '$executeRaw',
        args: { sql: 'select 1' },
        query,
      }),
    ).rejects.toThrow(error);

    expect(query).toHaveBeenCalledTimes(1);
    expect(sleepModule.msleep).not.toHaveBeenCalled();
  });
});
