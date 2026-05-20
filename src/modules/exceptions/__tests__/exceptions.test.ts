import {
  buildClientErrorContent,
  buildUnexpectedContent,
  buildValidationContent,
  createExceptionHandler,
  createExceptionHandlers,
  getRequestMetadata,
  type ExceptionRequestLike,
  type ValidationErrorLike,
} from '../services';

class TestValidationError extends Error implements ValidationErrorLike {
  private readonly validationErrors: readonly unknown[];

  public constructor(validationErrors: readonly unknown[]) {
    super('validation failed');
    this.name = 'TestValidationError';
    this.validationErrors = validationErrors;
  }

  public errors(): readonly unknown[] {
    return this.validationErrors;
  }
}

class ClientError extends Error {
  public readonly response: Record<string, unknown>;

  public constructor(response: Record<string, unknown>) {
    super('aws client error');
    this.name = 'ClientError';
    this.response = response;
  }
}

function createRequest(
  overrides: Partial<ExceptionRequestLike> = {},
): ExceptionRequestLike {
  return {
    bodyText: '{"field":"value"}',
    headers: { toString: () => '{}' },
    method: 'POST',
    queryParams: { get: () => null },
    state: { requestId: 'req-1' },
    async text(): Promise<string> {
      return this.bodyText ?? '';
    },
    url: { path: '/tasks' },
    ...overrides,
  };
}

describe('exceptions', () => {
  it('extracts request metadata', () => {
    expect(getRequestMetadata(createRequest())).toEqual({
      requestId: 'req-1',
      path: '/tasks',
      method: 'POST',
    });
  });

  it('builds validation content with body and error details', async () => {
    const [content, logExtras] = await buildValidationContent(
      createRequest(),
      new TestValidationError([{ field: 'name' }]),
      getRequestMetadata(createRequest()),
    );

    expect(content).toMatchObject({
      detail: 'Request validation failed',
      requestId: 'req-1',
      errorCount: 1,
      body: '{"field":"value"}',
    });
    expect(logExtras).toEqual({
      errorCount: 1,
      errors: [{ field: 'name' }],
      body: '{"field":"value"}',
    });
  });

  it('builds AWS client error content from response metadata', async () => {
    const [content, logExtras] = await buildClientErrorContent(
      createRequest(),
      new ClientError({
        Error: { Code: 'Throttling', Message: 'Too many requests' },
        ResponseMetadata: { RequestId: 'aws-1', HTTPStatusCode: 429 },
      }),
      getRequestMetadata(createRequest()),
    );

    expect(content).toMatchObject({
      detail: 'AWS service error',
      requestId: 'req-1',
      awsMetadata: {
        awsRequestId: 'aws-1',
        httpStatusCode: 429,
        errorCode: 'Throttling',
        errorMessage: 'Too many requests',
      },
    });
    expect(logExtras).toEqual({
      awsMetadata: {
        awsRequestId: 'aws-1',
        httpStatusCode: 429,
        errorCode: 'Throttling',
        errorMessage: 'Too many requests',
      },
    });
  });

  it('builds unexpected content with the exception name', async () => {
    const [content, logExtras] = await buildUnexpectedContent(
      createRequest(),
      new TypeError('bad value'),
      getRequestMetadata(createRequest()),
    );

    expect(content).toEqual({
      detail: 'Internal Server Error (TypeError)',
      requestId: 'req-1',
      path: '/tasks',
      method: 'POST',
    });
    expect(logExtras).toEqual({ exceptionType: 'TypeError' });
  });

  it('creates a map of exception handlers by error type', async () => {
    const handlers = createExceptionHandlers([
      { errorType: TypeError, statusCode: 400 },
    ]);

    const handler = handlers.get(TypeError);
    expect(handler).toBeDefined();
    await expect(
      handler?.(createRequest(), new TypeError('invalid')),
    ).resolves.toEqual({
      statusCode: 400,
      content: {
        detail: 'invalid',
        requestId: 'req-1',
        path: '/tasks',
        method: 'POST',
      },
    });
  });

  it('resolves the first matching rule via instanceof', async () => {
    class BaseError extends Error {}
    class ChildError extends BaseError {}

    const handler = createExceptionHandler([
      { errorType: ChildError, statusCode: 409 },
      { errorType: BaseError, statusCode: 500 },
    ]);

    await expect(
      handler(createRequest(), new ChildError('conflict')),
    ).resolves.toEqual({
      statusCode: 409,
      content: {
        detail: 'conflict',
        requestId: 'req-1',
        path: '/tasks',
        method: 'POST',
      },
    });
  });

  it('supports content builders and suppressed details', async () => {
    const handler = createExceptionHandler([
      {
        errorType: Error,
        statusCode: 422,
        includeDetail: false,
        contentBuilder: async (_request, error, metadata) => [
          { detail: error.message, ...metadata, custom: true },
          { custom: true },
        ],
      },
    ]);

    await expect(handler(createRequest(), new Error('boom'))).resolves.toEqual({
      statusCode: 422,
      content: {
        detail: 'boom',
        requestId: 'req-1',
        path: '/tasks',
        method: 'POST',
        custom: true,
      },
    });
  });

  it('returns a 500 fallback when no rule matches', async () => {
    const handler = createExceptionHandler([]);

    await expect(
      handler(createRequest(), new Error('unknown')),
    ).resolves.toEqual({
      statusCode: 500,
      content: {
        detail: 'Unhandled exception',
        requestId: 'req-1',
        path: '/tasks',
        method: 'POST',
      },
    });
  });
});
