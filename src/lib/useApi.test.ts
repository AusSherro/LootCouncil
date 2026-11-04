import { afterEach, describe, expect, it, vi } from 'vitest';

const mutateMock = vi.fn((filter: unknown) => {
    void filter;
    return Promise.resolve([]);
});

vi.mock('swr', () => ({
    default: vi.fn(),
    mutate: (filter: unknown) => mutateMock(filter),
}));

import { ApiError, apiFetcher, revalidateApi } from './useApi';

afterEach(() => {
    vi.unstubAllGlobals();
    mutateMock.mockClear();
});

describe('apiFetcher', () => {
    it('returns parsed JSON for OK responses', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })));
        await expect(apiFetcher('/api/x')).resolves.toEqual({ ok: 1 });
    });

    it('throws ApiError carrying the server error message and status', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Nope' }), { status: 404 })));
        const err = (await apiFetcher('/api/x').catch((e: unknown) => e)) as ApiError;
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(404);
        expect(err.message).toBe('Nope');
    });
});

describe('revalidateApi', () => {
    function filterFor(...paths: string[]) {
        void revalidateApi(...paths);
        return mutateMock.mock.calls.at(-1)![0] as (key: unknown) => boolean;
    }

    it('matches exact paths, query-string variants and nested routes', () => {
        const f = filterFor('/api/budget');
        expect(f('/api/budget')).toBe(true);
        expect(f('/api/budget?month=2026-01')).toBe(true);
        expect(f('/api/budget/forecast?months=3')).toBe(true);
        expect(f('/api/budgets')).toBe(false);
        expect(f('/api/accounts')).toBe(false);
    });

    it('matches every API key when called without paths', () => {
        const f = filterFor();
        expect(f('/api/accounts')).toBe(true);
        expect(f('not-an-api-key')).toBe(false);
        expect(f(['not-an-api-key'])).toBe(false);
    });

    it('matches useApiQuery array keys by their leading API path', () => {
        const f = filterFor('/api/transactions');
        expect(f(['/api/transactions', 'income-expense', 12])).toBe(true);
        expect(f(['/api/accounts', 'x'])).toBe(false);
    });
});
