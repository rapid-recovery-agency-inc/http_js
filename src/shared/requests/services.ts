import { createLogger } from '../logging/services';

const logger = createLogger('requests');

const PRODUCT_FIELDS = [
  'product_name',
  'product_module',
  'product_feature',
  'product_tenant',
] as const;

type ProductField = (typeof PRODUCT_FIELDS)[number];

export interface UrlLike {
  path: string;
}

export interface QueryParamsLike {
  get(key: string): string | null | undefined;
}

export interface HeadersLike {
  toString(): string;
}

export interface RequestLike {
  headers: HeadersLike;
  method: string;
  queryParams: QueryParamsLike;
  text(): Promise<string>;
  url: UrlLike;
}

export interface ResponseLike {
  body: Uint8Array | ArrayBuffer | string;
  statusCode: number;
}

export interface StreamingResponseLike {
  bodyIterator: AsyncIterable<Uint8Array>;
  headers: HeadersLike;
}

export type NextCallable = (request: RequestLike) => Promise<ResponseLike>;
export type StreamingNextCallable = (
  request: RequestLike,
) => Promise<StreamingResponseLike>;

export interface ExtractedRequestData {
  path: string;
  requestHeaders: string;
  requestBody: string;
  productFeature: string | null;
  productModule: string | null;
  productName: string | null;
  productTenant: string | null;
}

function createEmptyProductFields(): Record<ProductField, string | null> {
  return {
    product_name: null,
    product_module: null,
    product_feature: null,
    product_tenant: null,
  };
}

function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value);
  return normalized.length > 0 ? normalized : null;
}

function extractProductFieldsFromBody(
  requestBody: string,
): Record<ProductField, string | null> {
  if (requestBody.length === 0) {
    return createEmptyProductFields();
  }

  const parsedBody = JSON.parse(requestBody) as Record<string, unknown>;

  return {
    product_name: normalizeNullableString(parsedBody.product_name),
    product_module: normalizeNullableString(parsedBody.product_module),
    product_feature: normalizeNullableString(parsedBody.product_feature),
    product_tenant: normalizeNullableString(parsedBody.product_tenant),
  };
}

function extractProductFieldsFromQuery(
  queryParams: QueryParamsLike,
): Record<ProductField, string | null> {
  return {
    product_name: normalizeNullableString(queryParams.get('product_name')),
    product_module: normalizeNullableString(queryParams.get('product_module')),
    product_feature: normalizeNullableString(
      queryParams.get('product_feature'),
    ),
    product_tenant: normalizeNullableString(queryParams.get('product_tenant')),
  };
}

export async function extractRequestData(
  request: RequestLike,
): Promise<ExtractedRequestData> {
  const requestBody = await request.text();

  let productFields = createEmptyProductFields();

  if (request.method.toUpperCase() === 'POST') {
    try {
      productFields = extractProductFieldsFromBody(requestBody);
    } catch (error) {
      logger.error(
        'extractRequestData: Failed to decode JSON body',
        error as Error,
      );
      throw error;
    }
  } else if (request.method.toUpperCase() === 'GET') {
    productFields = extractProductFieldsFromQuery(request.queryParams);
  }

  return {
    path: request.url.path,
    requestHeaders: String(request.headers),
    requestBody,
    productName: productFields.product_name,
    productModule: productFields.product_module,
    productFeature: productFields.product_feature,
    productTenant: productFields.product_tenant,
  };
}
