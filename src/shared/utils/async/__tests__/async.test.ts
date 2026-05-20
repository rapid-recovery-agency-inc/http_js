import { timeout } from '../timeout';

describe('async', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves wrapped functions before the timeout', async () => {
    const wrapped = timeout(async (value: number) => value * 2, 1);
    const promise = wrapped(2);

    await expect(promise).resolves.toBe(4);
  });

  it('rejects when the timeout elapses first', async () => {
    const wrapped = timeout(
      () => new Promise<void>(() => undefined),
      1,
      'request timed out',
    );
    const promise = wrapped();

    jest.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow('request timed out');
  });
});
