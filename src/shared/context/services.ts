import type { RequestLike } from '../requests/services';

export interface ContextState {
  context?: unknown;
  [key: string]: unknown;
}

export interface ContextRequestLike extends RequestLike {
  state?: ContextState;
}

export interface ContextOptions<
  TEnvironment,
  TWriter,
  TReader,
  TRequest extends ContextRequestLike,
> {
  enhancers?: Array<ContextEnhancer<TEnvironment, TWriter, TReader, TRequest>>;
  getReaderResources(environment: TEnvironment): TReader[];
  getWriterResource(environment: TEnvironment): TWriter;
  selectReader?: (readers: TReader[]) => TReader;
}

export type ContextFactory<
  TEnvironment,
  TWriter,
  TReader,
  TRequest extends ContextRequestLike,
> = (request: TRequest) => Context<TEnvironment, TWriter, TReader, TRequest>;

export type ContextEnhancer<
  TEnvironment,
  TWriter,
  TReader,
  TRequest extends ContextRequestLike,
> = (
  request: TRequest,
  context: Context<TEnvironment, TWriter, TReader, TRequest>,
) => Context<TEnvironment, TWriter, TReader, TRequest> | void;

function defaultSelectReader<TReader>(readers: TReader[]): TReader {
  if (readers.length === 0) {
    throw new Error('Context: reader resources cannot be empty');
  }

  return readers[Math.floor(Math.random() * readers.length)] as TReader;
}

export class Context<
  TEnvironment,
  TWriter,
  TReader,
  TRequest extends ContextRequestLike,
> {
  public readonly env: TEnvironment;
  public readonly readerPools: TReader[];
  public readonly request: TRequest;
  public readonly writerPool: TWriter;

  private readonly selectReader: (readers: TReader[]) => TReader;

  public constructor(options: {
    env: TEnvironment;
    readerPools: TReader[];
    request: TRequest;
    selectReader?: (readers: TReader[]) => TReader;
    writerPool: TWriter;
  }) {
    this.env = options.env;
    this.readerPools = options.readerPools;
    this.request = options.request;
    this.writerPool = options.writerPool;
    this.selectReader = options.selectReader ?? defaultSelectReader;
  }

  public get writer(): TWriter {
    return this.writerPool;
  }

  public get reader(): TReader {
    return this.selectReader(this.readerPools);
  }
}

export function attachContextToRequest<
  TEnvironment,
  TWriter,
  TReader,
  TRequest extends ContextRequestLike,
>(
  request: TRequest,
  context: Context<TEnvironment, TWriter, TReader, TRequest>,
): void {
  request.state ??= {};
  request.state.context = context;
}

function applyEnhancers<
  TEnvironment,
  TWriter,
  TReader,
  TRequest extends ContextRequestLike,
>(
  request: TRequest,
  context: Context<TEnvironment, TWriter, TReader, TRequest>,
  enhancers: Array<ContextEnhancer<TEnvironment, TWriter, TReader, TRequest>>,
): Context<TEnvironment, TWriter, TReader, TRequest> {
  let currentContext = context;

  for (const enhancer of enhancers) {
    const enhancedContext = enhancer(request, currentContext);
    if (enhancedContext !== undefined) {
      currentContext = enhancedContext;
    }
  }

  attachContextToRequest(request, currentContext);
  return currentContext;
}

export function buildContextFactory<
  TEnvironment,
  TWriter,
  TReader,
  TRequest extends ContextRequestLike,
>(
  environment: TEnvironment,
  options: ContextOptions<TEnvironment, TWriter, TReader, TRequest>,
): ContextFactory<TEnvironment, TWriter, TReader, TRequest> {
  return (
    request: TRequest,
  ): Context<TEnvironment, TWriter, TReader, TRequest> => {
    const context = new Context({
      env: environment,
      readerPools: options.getReaderResources(environment),
      request,
      writerPool: options.getWriterResource(environment),
      ...(options.selectReader === undefined
        ? {}
        : { selectReader: options.selectReader }),
    });

    attachContextToRequest(request, context);

    if (options.enhancers === undefined || options.enhancers.length === 0) {
      return context;
    }

    return applyEnhancers(request, context, options.enhancers);
  };
}

export function buildContextDependencyFactory<
  TEnvironment,
  TWriter,
  TReader,
  TRequest extends ContextRequestLike,
>(
  environment: TEnvironment,
  options: ContextOptions<TEnvironment, TWriter, TReader, TRequest>,
): (request: TRequest) => void {
  const factory = buildContextFactory(environment, options);

  return (request: TRequest): void => {
    factory(request);
  };
}
