import {
  attachContextToRequest,
  type ContextRequestLike,
  type ServiceContext,
} from '../services';

function createRequest(): ContextRequestLike {
  return {
    headers: {
      toString: () => JSON.stringify({ authorization: 'Bearer token' }),
    },
    method: 'GET',
    queryParams: { get: () => null },
    async text(): Promise<string> {
      return '';
    },
    url: { path: '/example' },
  };
}

describe('context', () => {
  it('attaches service context to request state', () => {
    const request = createRequest();
    const context: ServiceContext<string, string> = {
      writer: 'writer-client',
      reader: 'reader-client',
    };

    attachContextToRequest(request, context);

    expect(request.state?.context).toBe(context);
  });

  it('initializes request.state when missing', () => {
    const request = createRequest();
    const context: ServiceContext<{ id: string }, { id: string }> = {
      writer: { id: 'writer' },
      reader: { id: 'reader' },
    };

    expect(request.state).toBeUndefined();

    attachContextToRequest(request, context);

    expect(request.state?.context).toEqual(context);
  });
});
