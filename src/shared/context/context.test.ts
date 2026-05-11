import type { HeadersLike, QueryParamsLike } from '../requests/services.js';
import {
  Context,
  attachContextToRequest,
  buildContextDependencyFactory,
  buildContextFactory,
  type ContextRequestLike,
} from './services.js';

class TestHeaders implements HeadersLike {
  private readonly entries: Record<string, string>;

  public constructor(entries: Record<string, string>) {
    this.entries = entries;
  }

  public toString(): string {
    return JSON.stringify(this.entries);
  }
}

class TestQueryParams implements QueryParamsLike {
  public get(): string | null {
    return null;
  }
}

function createRequest(): ContextRequestLike {
  return {
    headers: new TestHeaders({ authorization: 'Bearer token' }),
    method: 'GET',
    queryParams: new TestQueryParams(),
    async text(): Promise<string> {
      return '';
    },
    url: { path: '/example' },
  };
}

describe('context', () => {
  const environment = { serviceName: 'notifications' };
  const writerPool = { role: 'writer' };
  const readerPools = [{ role: 'reader-a' }, { role: 'reader-b' }];

  it('exposes writer and reader resources', () => {
    const request = createRequest();
    const context = new Context({
      env: environment,
      readerPools,
      request,
      selectReader: (readers) => readers[0]!,
      writerPool,
    });

    expect(context.writer).toBe(writerPool);
    expect(context.reader).toBe(readerPools[0]);
    expect(context.env).toBe(environment);
    expect(context.request).toBe(request);
  });

  it('attaches context to request state', () => {
    const request = createRequest();
    const context = new Context({
      env: environment,
      readerPools,
      request,
      writerPool,
    });

    attachContextToRequest(request, context);

    expect(request.state?.context).toBe(context);
  });

  it('builds and returns a request-scoped context', () => {
    const request = createRequest();
    const factory = buildContextFactory(environment, {
      getReaderResources: () => readerPools,
      getWriterResource: () => writerPool,
      selectReader: (readers) => readers[1]!,
    });

    const context = factory(request);

    expect(context.reader).toBe(readerPools[1]);
    expect(context.writer).toBe(writerPool);
    expect(request.state?.context).toBe(context);
  });

  it('applies enhancers to the built context', () => {
    const request = createRequest();
    const factory = buildContextFactory(environment, {
      enhancers: [
        (currentRequest, context) => {
          currentRequest.state = {
            ...currentRequest.state,
            requestId: 'req-1',
          };
          return context;
        },
      ],
      getReaderResources: () => readerPools,
      getWriterResource: () => writerPool,
    });

    const context = factory(request);

    expect(request.state?.context).toBe(context);
    expect(request.state?.requestId).toBe('req-1');
  });

  it('builds a dependency factory that attaches context without returning it', () => {
    const request = createRequest();
    const dependency = buildContextDependencyFactory(environment, {
      getReaderResources: () => readerPools,
      getWriterResource: () => writerPool,
    });

    expect(dependency(request)).toBeUndefined();
    expect(request.state?.context).toBeInstanceOf(Context);
  });

  it('rejects empty reader pools when the reader getter is used', () => {
    const request = createRequest();
    const context = new Context({
      env: environment,
      readerPools: [],
      request,
      writerPool,
    });

    expect(() => context.reader).toThrow(
      'Context: reader resources cannot be empty',
    );
  });
});
