import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getTestDatabaseUrl, resetDatabase } from './reset-database.js';

const apiRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(apiRoot, '../..');
const prismaSchema = resolve(apiRoot, 'prisma/schema.prisma');

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

export default async function setupIntegration(): Promise<() => Promise<void>> {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  run('docker', ['compose', 'up', '-d', '--wait', 'postgres']);

  if (!existsSync(prismaSchema)) {
    throw new Error(`Prisma schema is required before integration tests can run: ${prismaSchema}`);
  }

  run('pnpm', ['--filter', 'api', 'exec', 'prisma', 'migrate', 'deploy']);
  await resetDatabase();

  return async () => {
    await resetDatabase();
  };
}
