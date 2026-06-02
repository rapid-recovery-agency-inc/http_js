import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

import { createLogger } from '../../logging/services';

export interface AWSEnvironment {
  AWS_REGION: string;
  ENVIRONMENT_SECRET_NAME: string;
}

const logger = createLogger('aws');

function sortSecretsByTimestamp(
  secrets: Record<string, string>,
): Record<string, string> {
  if (Object.keys(secrets).length <= 1) {
    return secrets;
  }

  return Object.fromEntries(
    Object.entries(secrets).sort(
      ([leftKey], [rightKey]) =>
        new Date(rightKey).getTime() - new Date(leftKey).getTime(),
    ),
  );
}

export async function fetchAwsSecret(
  secretName: string,
  awsRegion: string,
  client = new SecretsManagerClient({ region: awsRegion }),
): Promise<Record<string, string>> {
  let response;

  try {
    response = await client.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    );
  } catch (error) {
    logger.error(`fetchAwsSecret:error:${secretName}: ${String(error)}`);
    throw error;
  }

  if (response.SecretString === undefined) {
    throw new Error(`Secret ${secretName} not found`);
  }

  try {
    return JSON.parse(response.SecretString) as Record<string, string>;
  } catch (error) {
    logger.error(
      `fetchAwsSecret:Error parsing secret ${secretName}: ${String(error)}`,
    );
    throw error;
  }
}

export async function loadAwsEnv(
  environment: AWSEnvironment,
  client = new SecretsManagerClient({ region: environment.AWS_REGION }),
): Promise<Record<string, string | string[]>> {
  const secretValues = await fetchAwsSecret(
    environment.ENVIRONMENT_SECRET_NAME,
    environment.AWS_REGION,
    client,
  );

  if (!('SECRETS_SECRET_NAME' in secretValues)) {
    const message =
      'loadAwsEnv: ValueError: SECRETS_SECRET_NAME not found in secrets';
    logger.error(message);
    throw new Error(message);
  }

  const secrets = sortSecretsByTimestamp(
    await fetchAwsSecret(
      secretValues.SECRETS_SECRET_NAME,
      environment.AWS_REGION,
      client,
    ),
  );

  return {
    ...secretValues,
    SECRETS: Object.values(secrets),
  };
}
