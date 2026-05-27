export type TimeoutWrapped<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult>;

export function timeout<TArgs extends unknown[], TResult>(
  func: (...args: TArgs) => TResult | Promise<TResult>,
  seconds = 10,
  errorMessage = 'Timer expired',
): TimeoutWrapped<TArgs, TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    return await new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(errorMessage));
      }, seconds * 1000);

      Promise.resolve(func(...args))
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  };
}
