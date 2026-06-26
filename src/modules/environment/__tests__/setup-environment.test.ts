import {
  normalizeSecretValues,
  parseSetupEnvArgs,
} from '../../../cli/setup-environment';

describe('setup-environment', () => {
  describe('normalizeSecretValues', () => {
    it('should transform numbers and booleans to strings', () => {
      const payload = {
        PORT: 8080,
        DEBUG: true,
        API_KEY: 'secret123',
      };

      const result = normalizeSecretValues(payload);

      expect(result).toEqual({
        PORT: '8080',
        DEBUG: 'true',
        API_KEY: 'secret123',
      });
    });

    it('should throw an error if it receives a null value', () => {
      const payload = { INVALID: null };
      expect(() => normalizeSecretValues(payload)).toThrow(/cannot be null/i);
    });
  });

  describe('parseSetupEnvArgs', () => {
    it('should correctly extract the secret-name and the command', () => {
      const argv = ['--secret-name', 'prod/app', '--', 'node', 'server.js'];
      const result = parseSetupEnvArgs(argv);

      expect(result.secretNames).toEqual(['prod/app']);
      expect(result.cliCommand).toEqual({
        command: 'node',
        args: ['server.js'],
      });
    });

    it('should parse the write-to flag and allow missing commands if writing to file', () => {
      const argv = ['--write-to', '.env.production'];
      const result = parseSetupEnvArgs(argv);

      expect(result.writeTo).toBe('.env.production');
      expect(result.error).toBeUndefined();
    });

    it('should aggregate multiple secret names from different flags', () => {
      const argv = [
        '--secret-name',
        'base',
        '--secret-names',
        'web,worker',
        '--',
        'node',
        'app.js',
      ];
      const result = parseSetupEnvArgs(argv);

      expect(result.secretNames).toEqual(['base', 'web', 'worker']);
    });

    it('should return an error if the command is missing and write-to is not provided', () => {
      const argv = ['--secret-name', 'prod/app'];
      const result = parseSetupEnvArgs(argv);

      expect(result.error).toBe('Missing command to execute.');
    });

    it('should return an error if a flag is missing its value', () => {
      const argv = ['--secret-name'];
      const result = parseSetupEnvArgs(argv);

      expect(result.error).toBe('Missing value for --secret-name.');
    });
  });
});
