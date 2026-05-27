import type { RequestLike } from '../requests/services';

export interface ContextState {
  context?: unknown;
  [key: string]: unknown;
}

export interface ContextRequestLike extends RequestLike {
  state?: ContextState;
}

export interface ServiceContext<TWriter, TReader> {
  writer: TWriter;
  reader: TReader;
}

export function attachContextToRequest<
  TWriter,
  TReader,
  TRequest extends ContextRequestLike,
>(request: TRequest, context: ServiceContext<TWriter, TReader>): void {
  request.state ??= {};
  request.state.context = context;
}
