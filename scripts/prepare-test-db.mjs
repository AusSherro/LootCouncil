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
execFileSync(
    process.execPath,
    [prismaCli, 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate', '--accept-data-loss'],
    {
        cwd: process.cwd(),
        env: {
            ...process.env,
            DATABASE_URL: 'file:../data/loot-council-test.db',
        },
        stdio: 'inherit',
    }
);