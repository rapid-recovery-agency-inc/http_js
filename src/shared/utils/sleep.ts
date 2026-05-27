export const msleep = async (milliSeconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliSeconds));
};

export const sleep = async (
  seconds: number,
  message?: string,
): Promise<void> => {
  if (message) {
    // eslint-disable-next-line no-console
    console.log(message);
  }
  await msleep(seconds * 1_000);
};
