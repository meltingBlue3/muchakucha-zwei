import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

function requireDatabaseUrl(): string {
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
  // PrismaPg serializes DateTime values without an offset and parses returned
  // timestamps as UTC. Every pooled connection must therefore use UTC, even
  // when the server or connection URL has a different default timezone.
  const url = new URL(databaseUrl);
  url.searchParams.set('options', [url.searchParams.get('options'), '-c timezone=UTC'].filter(Boolean).join(' '));
  return url.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg({ connectionString: requireDatabaseUrl() });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
