import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { getTestDatabaseUrl, resetDatabase } from './reset-database.js';

const apiRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(apiRoot, '../..');

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.\n${detail}`);
  }
}

async function hasReadyPostgres(databaseUrl: string): Promise<boolean> {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 1_000 });

  try {
    await client.connect();
    const result = await client.query<{ version: number }>(
      `SELECT current_setting('server_version_num')::integer AS version`,
    );
    const major = Math.floor(result.rows[0]!.version / 10_000);
    // PostgreSQL 17+ is sufficient for this project (gen_random_uuid, timestamptz, etc.)
    return major >= 17;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export default async function setupIntegration(): Promise<() => Promise<void>> {
  process.env.DATABASE_URL = getTestDatabaseUrl();

  if (!(await hasReadyPostgres(process.env.DATABASE_URL))) {
    throw new Error(
      'PostgreSQL 17+ is required. Ensure PostgreSQL is running on the configured DATABASE_URL.',
    );
  }
  run('pnpm', ['--filter', 'api', 'exec', 'prisma', 'migrate', 'deploy']);
  await resetDatabase();

  return async () => {
    await resetDatabase();
  };
}
