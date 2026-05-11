import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { Pool } from 'pg';

import { createLogger, LogLevel } from '../../shared/logging/services.js';

export interface E2ETestEnvironment {
  TEST_DATABASE_URL: string;
}

const logger = createLogger('e2e-testing', { logLevel: LogLevel.DEBUG });

export interface Migration {
  content: string;
  name: string;
}

export interface TestDatabasePool {
  end(): Promise<void>;
  open?: () => Promise<void> | void;
  query(text: string, values?: unknown[]): Promise<unknown>;
  wait?: () => Promise<void> | void;
}

export type PoolFactory = (connectionString: string) => TestDatabasePool;

interface CustomAsyncTestCaseOptions {
  env: E2ETestEnvironment;
  migrationsFolderPath: string;
  adminPoolFactory?: PoolFactory;
  databasePoolFactory?: PoolFactory;
  now?: () => number;
  pid?: () => number;
}

const migrationFileCache = new Map<string, Migration[]>();

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function createPool(connectionString: string): TestDatabasePool {
  return new Pool({ connectionString }) as TestDatabasePool;
}

export function resetMigrationFileCache(): void {
  migrationFileCache.clear();
}

export function getMigrationFilesContent(
  migrationFolderPath: string,
): Migration[] {
  const normalizedPath = path.resolve(migrationFolderPath);
  const cached = migrationFileCache.get(normalizedPath);
  if (cached !== undefined) {
    return cached;
  }

  const migrations = readdirSync(normalizedPath)
    .sort((left, right) => left.localeCompare(right))
    .flatMap((fileName) => {
      if (!fileName.endsWith('.sql')) {
        logger.warning('getMigrationFilesContent: skipping non-SQL file', {
          fileName,
          migrationFolderPath: normalizedPath,
        });
        return [];
      }

      return [
        {
          name: fileName,
          content: readFileSync(path.join(normalizedPath, fileName), 'utf8'),
        },
      ];
    });

  migrationFileCache.set(normalizedPath, migrations);
  return migrations;
}

export function buildTestDatabaseConnectionString(
  connectionString: string,
  databaseName: string,
): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export class CustomAsyncTestCase {
  public readonly env: E2ETestEnvironment;
  public readonly migrationsFolderPath: string;

  public databasePool: TestDatabasePool | null = null;
  public dbName: string | null = null;

  private readonly adminPoolFactory: PoolFactory;
  private readonly databasePoolFactory: PoolFactory;
  private readonly now: () => number;
  private readonly pid: () => number;
  private adminPool: TestDatabasePool | null = null;

  public constructor(options: CustomAsyncTestCaseOptions) {
    this.env = options.env;
    this.migrationsFolderPath = options.migrationsFolderPath;
    this.adminPoolFactory = options.adminPoolFactory ?? createPool;
    this.databasePoolFactory = options.databasePoolFactory ?? createPool;
    this.now = options.now ?? Date.now;
    this.pid = options.pid ?? (() => process.pid);
  }

  public async setUp(): Promise<void> {
    if (this.env.TEST_DATABASE_URL.length === 0) {
      throw new Error(
        "CustomAsyncTestCase: 'env.TEST_DATABASE_URL' is required",
      );
    }
    if (this.migrationsFolderPath.length === 0) {
      throw new Error(
        "CustomAsyncTestCase: 'migrationsFolderPath' is required",
      );
    }

    this.dbName = `test_db_${this.pid()}_${this.now()}`;
    this.adminPool = this.adminPoolFactory(this.env.TEST_DATABASE_URL);
    await this.adminPool.query(
      `CREATE DATABASE ${quoteIdentifier(this.dbName)}`,
    );

    this.databasePool = this.databasePoolFactory(
      buildTestDatabaseConnectionString(
        this.env.TEST_DATABASE_URL,
        this.dbName,
      ),
    );
    await this.databasePool.open?.();
    await this.databasePool.wait?.();

    const migrations = getMigrationFilesContent(this.migrationsFolderPath);
    for (const migration of migrations) {
      await this.databasePool.query(migration.content);
    }
  }

  public async tearDown(): Promise<void> {
    if (this.databasePool !== null) {
      await this.databasePool.end();
    }

    if (this.adminPool !== null && this.dbName !== null) {
      await this.adminPool.query(
        `DROP DATABASE IF EXISTS ${quoteIdentifier(this.dbName)}`,
      );
      await this.adminPool.end();
    }

    this.databasePool = null;
    this.dbName = null;
    this.adminPool = null;
  }
}
