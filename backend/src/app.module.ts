import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsModule } from './jobs/jobs.module';
import { Job } from './jobs/job.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Bonus production-readiness improvement: per-IP rate limiting.
    // See README "Bonus" section for the reasoning - in short, once an API
    // is reachable directly (not just through our UI), it needs its own
    // abuse protection instead of relying on the frontend to be "well
    // behaved". 30 requests / 10s per IP is generous for normal dashboard
    // use but stops a runaway script or naive retry loop from hammering
    // the database.
    ThrottlerModule.forRoot([{ ttl: 10_000, limit: 30 }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');

        // Postgres in production when DATABASE_URL is set (e.g. on Render),
        // falling back to a local SQLite file for zero-config local dev.
        // Both go through the exact same entities/service/atomic-update
        // logic, so the concurrency guarantees hold on either engine.
        if (databaseUrl) {
          return {
            type: 'postgres' as const,
            url: databaseUrl,
            entities: [Job],
            synchronize: true,
            ssl: { rejectUnauthorized: false },
          };
        }

        // sql.js is a pure-JS/WASM SQLite build with no native compilation
        // step, so `npm install` + `npm start` works identically on any
        // machine/CI runner with no build toolchain required. autoSave
        // persists the in-memory DB to disk after every write.
        return {
          type: 'sqljs' as const,
          location: config.get<string>('SQLITE_PATH', 'data/job-queue.sqlite'),
          autoSave: true,
          entities: [Job],
          synchronize: true,
        };
      },
    }),
    JobsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
