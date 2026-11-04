import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        // Claude Code worktrees are full repo copies sharing the same test database.
        exclude: ['**/node_modules/**', '.claude/**'],
        env: {
            DATABASE_URL: 'file:../data/loot-council-test.db',
        },
        fileParallelism: false,
        maxWorkers: 1,
        root: rootDir,
    },
});