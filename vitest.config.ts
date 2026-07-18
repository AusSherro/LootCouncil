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
        env: {
            DATABASE_URL: 'file:../data/loot-council-test.db',
        },
        fileParallelism: false,
        maxWorkers: 1,
        root: rootDir,
    },
});