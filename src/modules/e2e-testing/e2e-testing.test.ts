import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CustomAsyncTestCase,
  buildTestDatabaseConnectionString,
  getMigrationFilesContent,
  resetMigrationFileCache,
} from './services.js';

interface MockPool {
  end: jest.Mock<Promise<void>, []>;
  open: jest.Mock<Promise<void>, []>;
  query: jest.Mock<Promise<unknown>, [string, ...unknown[]]>;
  wait: jest.Mock<Promise<void>, []>;
}

function createMockPool(): MockPool {
  return {
    end: jest.fn(async () => undefined),
    open: jest.fn(async () => undefined),
    query: jest.fn(async (_text: string, ..._values: unknown[]) => undefined),
    wait: jest.fn(async () => undefined),
  };
}

describe('e2e testing', () => {
  beforeEach(() => {
    resetMigrationFileCache();
  });

  it('builds a test database connection string', () => {
    expect(
      buildTestDatabaseConnectionString(
        'postgresql://postgres:password@localhost:5432/postgres',
        'test_db_1',
      ),
    ).toBe('postgresql://postgres:password@localhost:5432/test_db_1');
  });

  it('loads and caches sorted SQL migration files', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'http-js-migrations-'));

    try {
      writeFileSync(path.join(tempDir, '002_second.sql'), 'SELECT 2;');
      writeFileSync(path.join(tempDir, '001_first.sql'), 'SELECT 1;');
      writeFileSync(path.join(tempDir, 'README.md'), 'ignored');

      const migrations = getMigrationFilesContent(tempDir);
      const cached = getMigrationFilesContent(tempDir);

      expect(migrations).toEqual([
        { name: '001_first.sql', content: 'SELECT 1;' },
        { name: '002_second.sql', content: 'SELECT 2;' },
      ]);
      expect(cached).toBe(migrations);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates, migrates, and drops an isolated database', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'http-js-e2e-'));
    const adminPool = createMockPool();
    const databasePool = createMockPool();

    try {
      writeFileSync(
        path.join(tempDir, '001_create_users.sql'),
        'CREATE TABLE users (id INTEGER);',
      );

      const testCase = new CustomAsyncTestCase({
        env: {
          TEST_DATABASE_URL:
            'postgresql://postgres:password@localhost:5432/postgres',
        },
        migrationsFolderPath: tempDir,
        adminPoolFactory: () => adminPool,
        databasePoolFactory: () => databasePool,
        now: () => 1700000000000,
        pid: () => 1234,
      });

      await testCase.setUp();

      expect(testCase.dbName).toBe('test_db_1234_1700000000000');
      expect(adminPool.query).toHaveBeenCalledWith(
        'CREATE DATABASE "test_db_1234_1700000000000"',
      );
      expect(databasePool.open).toHaveBeenCalledTimes(1);
      expect(databasePool.wait).toHaveBeenCalledTimes(1);
      expect(databasePool.query).toHaveBeenCalledWith(
        'CREATE TABLE users (id INTEGER);',
      );

      await testCase.tearDown();

      expect(databasePool.end).toHaveBeenCalledTimes(1);
      expect(adminPool.query).toHaveBeenLastCalledWith(
        'DROP DATABASE IF EXISTS "test_db_1234_1700000000000"',
      );
      expect(adminPool.end).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('validates required environment input', async () => {
    const testCase = new CustomAsyncTestCase({
      env: { TEST_DATABASE_URL: '' },
      migrationsFolderPath: '/tmp/migrations',
    });

    await expect(testCase.setUp()).rejects.toThrow(
      "CustomAsyncTestCase: 'env.TEST_DATABASE_URL' is required",
    );
  });
});
