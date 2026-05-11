jest.mock('@aws-sdk/client-secrets-manager', () => {
  class GetSecretValueCommand {
    public readonly input: { SecretId: string };

    public constructor(input: { SecretId: string }) {
      this.input = input;
    }
  }

  class SecretsManagerClient {
    public readonly send = jest.fn();
  }

  return {
    GetSecretValueCommand,
    SecretsManagerClient,
  };
});

import { fetchAwsSecret, loadAwsEnv } from './services.js';

describe('aws', () => {
  function createClient(responses: Array<{ SecretString?: string }>) {
    return {
      send: jest.fn(async () => responses.shift()),
    };
  }

  it('fetches and parses an AWS secret', async () => {
    const client = createClient([{ SecretString: '{"API_KEY":"abc"}' }]);

    await expect(
      fetchAwsSecret('my-secret', 'eu-west-1', client as never),
    ).resolves.toEqual({
      API_KEY: 'abc',
    });
  });

  it('loads and merges aws env secrets with sorted secret values', async () => {
    const client = createClient([
      { SecretString: '{"SECRETS_SECRET_NAME":"inner","FOO":"bar"}' },
      {
        SecretString:
          '{"2025-01-01T00:00:00":"old","2026-01-01T00:00:00":"new"}',
      },
    ]);

    await expect(
      loadAwsEnv(
        {
          AWS_REGION: 'eu-west-1',
          ENVIRONMENT_SECRET_NAME: 'env-secret',
        },
        client as never,
      ),
    ).resolves.toEqual({
      SECRETS_SECRET_NAME: 'inner',
      FOO: 'bar',
      SECRETS: ['new', 'old'],
    });
  });

  it('fails when SECRETS_SECRET_NAME is missing', async () => {
    const client = createClient([{ SecretString: '{"FOO":"bar"}' }]);

    await expect(
      loadAwsEnv(
        {
          AWS_REGION: 'eu-west-1',
          ENVIRONMENT_SECRET_NAME: 'env-secret',
        },
        client as never,
      ),
    ).rejects.toThrow(
      'loadAwsEnv: ValueError: SECRETS_SECRET_NAME not found in secrets',
    );
  });
});
