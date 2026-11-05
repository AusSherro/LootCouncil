import path from 'node:path';

/**
 * Turn DATABASE_URL into an absolute SQLite file URL.
 *
 * Before Prisma 7, a relative `file:` path was resolved against the `prisma/`
 * folder (where schema.prisma lives), so `.env` says `file:../data/loot-council.db`.
 * Prisma 7 hands the URL to the SQLite driver, which would resolve it against
 * the current directory instead. Resolving it here keeps the existing setting
 * pointing at the same file.
 *
 * When DATABASE_URL is unset (CI has no .env, and `next build` loads this
 * module), it falls back to the usual local database.
 */
const DEFAULT_DATABASE_URL = 'file:../data/loot-council.db';

export function resolveDatabaseUrl(url: string = process.env.DATABASE_URL || DEFAULT_DATABASE_URL): string {
    if (!url.startsWith('file:')) return url;
    const filePath = url.slice('file:'.length);
    if (filePath === ':memory:' || path.isAbsolute(filePath)) return url;
    return `file:${path.resolve(process.cwd(), 'prisma', filePath)}`;
}
