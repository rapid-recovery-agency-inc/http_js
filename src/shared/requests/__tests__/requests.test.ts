import { resetLoggerCache } from '../../logging/services';
import {
  extractRequestData,
  validateRequestData,
  type HeadersLike,
  type QueryParamsLike,
  type RequestLike,
} from '../services';

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
  private readonly entries: Record<string, string>;

  public constructor(entries: Record<string, string>) {
    this.entries = entries;
  }

  public get(key: string): string | null {
    return this.entries[key] ?? null;
  }
}

function createRequest(overrides: Partial<RequestLike> = {}): RequestLike {
  return {
    headers: new TestHeaders({ authorization: 'Bearer token' }),
    method: 'GET',
    queryParams: new TestQueryParams({}),
    async text(): Promise<string> {
      return '';
    },
    url: { path: '/example' },
    ...overrides,
  };
}

describe('requests', () => {
  beforeEach(() => {
    resetLoggerCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('extracts product fields from a GET request', async () => {
    const request = createRequest({
      queryParams: new TestQueryParams({
        product_name: 'api',
        product_module: 'notifications',
        product_feature: 'send',
        product_tenant: 'tenant-a',
      }),
    });

    await expect(extractRequestData(request)).resolves.toEqual({
      path: '/example',
      requestHeaders: JSON.stringify({ authorization: 'Bearer token' }),
      requestBody: '',
      productName: 'api',
      productModule: 'notifications',
      productFeature: 'send',
      productTenant: 'tenant-a',
    });
  });

  it('extracts product fields from a POST request body', async () => {
    const request = createRequest({
      method: 'POST',
      async text(): Promise<string> {
        return JSON.stringify({
          product_name: 'api',
          product_module: 'notifications',
          product_feature: 'send',
          product_tenant: 'tenant-a',
        });
      },
    });

    const requestData = await extractRequestData(request);

    expect(requestData.productName).toBe('api');
    expect(requestData.productModule).toBe('notifications');
    expect(requestData.productFeature).toBe('send');
    expect(requestData.productTenant).toBe('tenant-a');
  });

  it('rethrows invalid POST JSON bodies', async () => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const request = createRequest({
      method: 'POST',
      async text(): Promise<string> {
        return '{invalid-json';
      },
    });

    await expect(extractRequestData(request)).rejects.toThrow(SyntaxError);
  });

  it('validates required product fields', () => {
    expect(() =>
      validateRequestData({
        path: '/example',
        requestHeaders: '{}',
        requestBody: '',
        productName: null,
        productModule: 'notifications',
        productFeature: 'send',
        productTenant: 'tenant-a',
      }),
    ).toThrow('validateRequestData:Missing required field: product_name');
  });
});
