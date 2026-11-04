'use client';

import useSWR, { mutate as globalMutate, type SWRConfiguration, type SWRResponse } from 'swr';

/**
 * Shared client-side data layer (ISSUES.md PERF-2 / FEAT-1).
 *
 * Pages and modals read API data through `useApi(url)` instead of hand-rolled
 * `useEffect` + `setLoading` + `fetch`. SWR gives us request de-duplication,
 * stale-while-revalidate caching between page visits, and a single place to
 * refresh data after a mutation (`revalidateApi`).
 *
 * Cache keys are the request URL. The active profile is carried by a cookie,
 * so `DataProvider` revalidates every key when the profile changes.
 */

export class ApiError extends Error {
    status: number;
    info: unknown;

    constructor(message: string, status: number, info: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.info = info;
    }
}

/** Default SWR fetcher: GET JSON, throw `ApiError` on non-2xx responses. */
export async function apiFetcher<T = unknown>(url: string): Promise<T> {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        let info: unknown = null;
        try {
            info = await res.json();
        } catch {
            // Non-JSON error body
        }
        const serverMessage =
            info && typeof info === 'object' && 'error' in info && typeof (info as { error: unknown }).error === 'string'
                ? (info as { error: string }).error
                : null;
        throw new ApiError(serverMessage ?? `Request failed: ${res.status} ${res.statusText}`, res.status, info);
    }
    return res.json() as Promise<T>;
}

/**
 * Read JSON from an API route. Pass `null` as the URL to skip the request
 * (e.g. while a modal is closed). `isLoading` is true only while there is no
 * cached data yet, so loading skeletons show on first load but not on
 * background revalidation.
 */
export function useApi<T = unknown>(
    url: string | null,
    config?: SWRConfiguration<T, Error>
): SWRResponse<T, Error> {
    return useSWR<T, Error>(url, apiFetcher<T>, config);
}

/** Key for `useApiQuery`: an API path followed by any extra key parts. */
export type ApiQueryKey = readonly [path: string, ...rest: unknown[]];

/**
 * Like `useApi`, for reads that need more than one GET (e.g. a report built
 * from several requests). The first key element is the API path the data
 * comes from, so `revalidateApi(path)` refreshes it too.
 */
export function useApiQuery<T, K extends ApiQueryKey = ApiQueryKey>(
    key: K | null,
    fetcher: (key: K) => Promise<T>,
    config?: SWRConfiguration<T, Error>
): SWRResponse<T, Error> {
    return useSWR<T, Error>(key, (k: K) => fetcher(k), config);
}

function keyPath(key: unknown): string | null {
    if (typeof key === 'string') return key;
    if (Array.isArray(key) && typeof key[0] === 'string') return key[0];
    return null;
}

function matchesPrefix(key: string, prefix: string): boolean {
    return key === prefix || key.startsWith(`${prefix}?`) || key.startsWith(`${prefix}/`);
}

/**
 * Revalidate cached API reads after a mutation. With no arguments every API
 * key is refreshed; otherwise only keys equal to, or nested/query-string
 * variants of, the given paths (e.g. `revalidateApi('/api/budget')` refreshes
 * `/api/budget?month=...` and `/api/budget/forecast?...`).
 */
export function revalidateApi(...paths: string[]): Promise<unknown[]> {
    return globalMutate((key) => {
        const path = keyPath(key);
        return (
            path !== null &&
            path.startsWith('/api/') &&
            (paths.length === 0 || paths.some((p) => matchesPrefix(path, p)))
        );
    });
}
