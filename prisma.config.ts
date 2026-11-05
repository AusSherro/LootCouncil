import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';
import { resolveDatabaseUrl } from './src/lib/databaseUrl';

// Prisma 7 no longer reads .env by itself. Variables already set (by the test
// scripts, for example) take precedence over the file.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: { path: 'prisma/migrations' },
    // Commands like `prisma generate` need no database, and CI has no .env,
    // so fall back to the usual local path.
    datasource: { url: resolveDatabaseUrl(process.env.DATABASE_URL ?? 'file:../data/loot-council.db') },
});
