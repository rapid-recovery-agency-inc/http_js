import { msleep, sleep } from '../sleep';

describe('msleep', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('resolves after the specified milliseconds', async () => {
    const promise = msleep(1_000);

    const resolved = jest.fn();

    void promise.then(resolved);

    expect(resolved).not.toHaveBeenCalled();

    jest.advanceTimersByTime(999);

    await Promise.resolve();

    expect(resolved).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);

    await promise;

    expect(resolved).toHaveBeenCalledTimes(1);
  });
});

describe('sleep', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('resolves after the specified seconds', async () => {
    const promise = sleep(2);

    const resolved = jest.fn();

    void promise.then(resolved);

    expect(resolved).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1_999);

    await Promise.resolve();

    expect(resolved).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);

    await promise;

    expect(resolved).toHaveBeenCalledTimes(1);
  });

  it('logs the message when provided', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const promise = sleep(1, 'Sleeping...');

    jest.advanceTimersByTime(1_000);

    await promise;

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('Sleeping...');
  });

  it('does not log when message is not provided', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const promise = sleep(1);

    jest.advanceTimersByTime(1_000);

    await promise;

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
