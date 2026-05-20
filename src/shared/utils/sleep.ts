export const msleep = async (miliSeconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, miliSeconds));
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
