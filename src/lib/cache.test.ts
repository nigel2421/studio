import { cacheService } from './cache';

describe('CacheService', () => {
    beforeEach(() => {
        cacheService.clear();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should set and get values', () => {
        cacheService.set('test', 'key1', { foo: 'bar' });
        expect(cacheService.get('test', 'key1')).toEqual({ foo: 'bar' });
    });

    it('should return null for non-existent keys', () => {
        expect(cacheService.get('test', 'non-existent')).toBeNull();
    });

    it('should return null for expired keys', () => {
        const ttl = 1000;
        cacheService.set('test', 'key1', 'value', ttl);

        jest.advanceTimersByTime(ttl + 10);

        expect(cacheService.get('test', 'key1')).toBeNull();
    });

    it('should handle namespaced clearing', () => {
        cacheService.set('ns1', 'key1', 'val1');
        cacheService.set('ns2', 'key1', 'val2');

        cacheService.clear('ns1');

        expect(cacheService.get('ns1', 'key1')).toBeNull();
        expect(cacheService.get('ns2', 'key1')).toEqual('val2');
    });

    it('should clear everything when no namespace is provided', () => {
        cacheService.set('ns1', 'key1', 'val1');
        cacheService.set('ns2', 'key1', 'val2');

        cacheService.clear();

        expect(cacheService.get('ns1', 'key1')).toBeNull();
        expect(cacheService.get('ns2', 'key1')).toBeNull();
    });

    it('should get or fetch correctly', async () => {
        const fetcher = jest.fn().mockResolvedValue('fetched-data');

        // First call should fetch
        const data1 = await cacheService.getOrFetch('test', 'key1', fetcher);
        expect(data1).toBe('fetched-data');
        expect(fetcher).toHaveBeenCalledTimes(1);

        // Second call should come from cache
        const data2 = await cacheService.getOrFetch('test', 'key1', fetcher);
        expect(data2).toBe('fetched-data');
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('should fetch again after expiration in getOrFetch', async () => {
        const fetcher = jest.fn().mockResolvedValue('fetched-data');
        const ttl = 1000;

        await cacheService.getOrFetch('test', 'key1', fetcher, ttl);

        jest.advanceTimersByTime(ttl + 10);

        await cacheService.getOrFetch('test', 'key1', fetcher, ttl);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
});
