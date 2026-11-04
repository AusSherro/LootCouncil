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
    return globalMutate(
        (key) =>
            typeof key === 'string' &&
            key.startsWith('/api/') &&
            (paths.length === 0 || paths.some((p) => matchesPrefix(key, p)))
    );
}
