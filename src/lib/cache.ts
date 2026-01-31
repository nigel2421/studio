type CacheEntry<T> = {
    data: T;
    expiry: number;
};

class CacheService {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private static instance: CacheService;

    private constructor() { }

    public static getInstance(): CacheService {
        if (!CacheService.instance) {
            CacheService.instance = new CacheService();
        }
        return CacheService.instance;
    }

    private getKey(namespace: string, key: string): string {
        return `${namespace}:${key}`;
    }

    public set<T>(namespace: string, key: string, data: T, ttlMs: number = 300000): void {
        const expiry = Date.now() + ttlMs;
        this.cache.set(this.getKey(namespace, key), { data, expiry });
    }

    public get<T>(namespace: string, key: string): T | null {
        const entry = this.cache.get(this.getKey(namespace, key));
        if (!entry) return null;

        if (Date.now() > entry.expiry) {
            this.cache.delete(this.getKey(namespace, key));
            return null;
        }

        return entry.data;
    }

    public async getOrFetch<T>(
        namespace: string,
        key: string,
        fetcher: () => Promise<T>,
        ttlMs: number = 300000
    ): Promise<T> {
        const cached = this.get<T>(namespace, key);
        if (cached !== null) return cached;

        const data = await fetcher();
        this.set(namespace, key, data, ttlMs);
        return data;
    }

    public clear(namespace?: string): void {
        if (namespace) {
            const keysToDelete = Array.from(this.cache.keys()).filter(k => k.startsWith(`${namespace}:`));
            keysToDelete.forEach(k => this.cache.delete(k));
        } else {
            this.cache.clear();
        }
    }
}

export const cacheService = CacheService.getInstance();
