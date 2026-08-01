import { defineConfig } from 'prisma/config';

const localTestDatabaseUrl =
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:55432/muchakucha_test';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Client generation does not connect, while migrated integration commands use
    // the same guarded loopback test default as the reset harness.
    url: process.env.DATABASE_URL ?? localTestDatabaseUrl,
  },
});
