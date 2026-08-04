import { Client } from 'pg';

const LOCAL_DATABASE_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function getTestDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  if (environment.TEST_DATABASE_URL) {
    return environment.TEST_DATABASE_URL;
  }

  const database = environment.TEST_POSTGRES_DB ?? 'muchakucha_test';
  const user = environment.TEST_POSTGRES_USER ?? 'muchakucha_test';
  const password = environment.TEST_POSTGRES_PASSWORD ?? 'muchakucha_test_only';
  const port = environment.TEST_POSTGRES_PORT ?? '5432';
  return `postgresql://${user}:${password}@127.0.0.1:${port}/${database}`;
}

function assertDisposableDatabase(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.slice(1);

  if (!LOCAL_DATABASE_HOSTS.has(parsed.hostname) || !/(?:^|[_-])test(?:$|[_-])/i.test(databaseName)) {
    throw new Error(
      `Refusing to reset non-disposable database '${parsed.hostname}/${databaseName}'. ` +
        'Use a loopback host and a database name containing a standalone test segment.',
    );
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function resetDatabase(databaseUrl = getTestDatabaseUrl()): Promise<void> {
  assertDisposableDatabase(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query<{ schemaname: string; tablename: string }>(`
      SELECT schemaname, tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations'
      ORDER BY tablename
    `);

    if (result.rows.length === 0) {
      return;
    }

    const tables = result.rows
      .map(({ schemaname, tablename }) => `${quoteIdentifier(schemaname)}.${quoteIdentifier(tablename)}`)
      .join(', ');
    await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
}
