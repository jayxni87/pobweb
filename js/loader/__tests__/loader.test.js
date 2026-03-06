import { describe, it, expect, vi } from 'vitest';
import { DataLoader } from '../loader.js';

// Mock fetch for testing
function mockFetch(data) {
  return vi.fn(() => Promise.resolve({
    ok: true,
    headers: new Map([['content-length', '100']]),
    json: () => Promise.resolve(data),
    body: null,
  }));
}

describe('DataLoader', () => {
  it('loads and caches data', async () => {
    const loader = new DataLoader();
    const testData = { key: 'value' };
    globalThis.fetch = mockFetch(testData);

    const result = await loader.load('test.json');
    expect(result).toEqual(testData);
    expect(loader.isCached('test.json')).toBe(true);
  });

  it('returns cached data on second load', async () => {
    const loader = new DataLoader();
    const testData = { key: 'value' };
    globalThis.fetch = mockFetch(testData);

    await loader.load('test.json');
    const result = await loader.load('test.json');
    expect(result).toEqual(testData);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent requests', async () => {
    const loader = new DataLoader();
    const testData = { key: 'value' };
    globalThis.fetch = mockFetch(testData);

    const [r1, r2] = await Promise.all([
      loader.load('test.json'),
      loader.load('test.json'),
    ]);
    expect(r1).toEqual(testData);
    expect(r2).toEqual(testData);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('preloads multiple files', async () => {
    const loader = new DataLoader();
    globalThis.fetch = vi.fn((url) => Promise.resolve({
      ok: true,
      headers: new Map(),
      json: () => Promise.resolve({ file: url }),
      body: null,
    }));

    const results = await loader.preload(['a.json', 'b.json']);
    expect(results).toHaveLength(2);
    expect(loader.isCached('a.json')).toBe(true);
    expect(loader.isCached('b.json')).toBe(true);
  });

  it('clears cache', async () => {
    const loader = new DataLoader();
    globalThis.fetch = mockFetch({ test: true });

    await loader.load('test.json');
    expect(loader.isCached('test.json')).toBe(true);
    loader.clear();
    expect(loader.isCached('test.json')).toBe(false);
  });

  it('throws on failed fetch', async () => {
    const loader = new DataLoader();
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      status: 404,
      headers: new Map(),
    }));

    await expect(loader.load('missing.json')).rejects.toThrow('Failed to load');
  });
});
