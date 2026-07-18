type CacheEntry = {
    data: unknown;
    expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

export async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
}

export async function fetchJsonCached<T>(url: string, ttlMs = 30_000): Promise<T> {
    const now = Date.now();
    const cached = cache.get(url);

    if (cached && cached.expiresAt > now) {
        return cached.data as T;
    }

    const data = await fetchJson<T>(url);
    cache.set(url, { data, expiresAt: now + ttlMs });
    return data;
}

export function clearCachedJson(url?: string): void {
    if (!url) {
        cache.clear();
        return;
    }

    cache.delete(url);
}
