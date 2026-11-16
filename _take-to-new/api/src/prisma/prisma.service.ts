import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { PrismaClient } from "@axiom/db";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("PrismaService");

  async onModuleInit() {
    // Don't crash the API if the DB is temporarily down — Prisma connects lazily on first query.
    try {
      await this.$connect();
      this.log.log("connected to database");
    } catch (e) {
      this.log.error(
        `initial DB connect failed (will retry on demand): ${(e as Error).message}. ` +
          `Make sure Postgres is up: docker compose up -d`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect().catch(() => undefined);
  }
}
