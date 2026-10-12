import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterEach, expect, test, vi } from 'vitest';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { getTestDatabaseUrl } from '../reset-database.js';

afterEach(() => vi.unstubAllEnvs());

// Check against SQL/pg, not only a Prisma round trip: the same offset error on
// both read and write can otherwise cancel out and hide shifted persisted data.
test.each(['Asia/Shanghai', 'America/Los_Angeles'])('preserves instants with a %s connection default', async timezone => {
  const url = new URL(getTestDatabaseUrl());
  url.searchParams.set('options', `-c timezone=${timezone} -c application_name=timestamp-test`);
  vi.stubEnv('DATABASE_URL', url.toString());
  const prisma = new PrismaService();
  const sql = new Client({ connectionString: getTestDatabaseUrl() });
  await sql.connect();
  try {
    const instant = new Date('2026-10-10T16:30:00.123Z');
    const result = await prisma.$queryRaw<Array<{ instant: Date }>>`SELECT TIMESTAMPTZ '2026-10-11 00:30:00.123+08' AS instant`;
    expect(result[0]!.instant.toISOString()).toBe(instant.toISOString());
    const id = randomUUID();
    await prisma.user.create({ data: {
      id, username: id.slice(0, 30), usernameCanonical: id.slice(0, 30), displayName: 'timestamp-test',
      passwordHash: '$argon2id$test-only', createdAt: instant,
    } });
    const persisted = await sql.query<{ created_at: Date }>('SELECT created_at FROM "User" WHERE id = $1', [id]);
    expect(persisted.rows[0]!.created_at.toISOString()).toBe(instant.toISOString());
    const setting = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_setting('application_name') AS name`;
    expect(setting[0]!.name).toBe('timestamp-test');
  } finally {
    await prisma.$disconnect();
    await sql.end();
  }
});
