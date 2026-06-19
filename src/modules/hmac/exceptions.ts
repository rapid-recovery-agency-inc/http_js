export class HMACException extends Error {
  public readonly detail: unknown;
  public readonly headers: Record<string, string> | undefined;
  public readonly statusCode: number;

  public constructor(
    statusCode: number,
    detail: unknown = undefined,
    headers: Record<string, string> | undefined = undefined,
  ) {
    super(typeof detail === 'string' ? detail : 'HMAC Exception');
    this.name = 'HMACException';
    this.statusCode = statusCode;
    this.detail = detail;
    this.headers = headers;
  }
}
