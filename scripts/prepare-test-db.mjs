/**
 * Build the test database from the committed migration history.
 *
 * This deliberately uses `migrate deploy` rather than `db push`. The test suite
 * is the only place migrations get exercised, so running them here means a
 * migration that fails to apply — or a schema change that was never captured in
 * a migration — breaks the build instead of silently reaching production.
 * See ISSUES.md CRIT-6.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const dataDir = resolve(process.cwd(), 'data');
const databasePath = resolve(dataDir, 'loot-council-test.db');
mkdirSync(dataDir, { recursive: true });

for (const suffix of ['', '-journal', '-shm', '-wal']) {
    rmSync(`${databasePath}${suffix}`, { force: true });
}

const prismaCli = resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
const testDatabaseUrl = 'file:../data/loot-council-test.db';

function runPrisma(args, options = {}) {
    return execFileSync(process.execPath, [prismaCli, ...args], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: testDatabaseUrl },
        ...options,
    });
}

// 1. Apply the committed migrations. Fails loudly if any migration is invalid.
runPrisma(['migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { stdio: 'inherit' });

// 2. Prove the migrated database matches schema.prisma. A non-empty diff means
//    the schema was edited without generating a migration, which would leave a
//    deployed database behind the code that queries it.
const diff = runPrisma(
    [
        'migrate',
        'diff',
        '--from-url',
        `file:${databasePath.replace(/\\/g, '/')}`,
        '--to-schema-datamodel',
        'prisma/schema.prisma',
        '--script',
    ],
    { encoding: 'utf8' }
);

if (!/^\s*--\s*This is an empty migration\.\s*$/m.test(diff)) {
    console.error('\nSchema drift detected: prisma/schema.prisma has changes with no migration.\n');
    console.error('The following SQL would be required to bring a migrated database up to date:\n');
    console.error(diff);
    console.error('Fix it by generating a migration:\n');
    console.error('  npx prisma migrate dev --name <describe-your-change>\n');
    process.exit(1);
}

console.log('Test database built from migrations; schema matches prisma/schema.prisma.');