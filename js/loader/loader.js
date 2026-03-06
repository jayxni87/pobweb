// PoBWeb - Data Loader with Lazy Loading and Progress
// Manages async loading of JSON data files with progress tracking.

export class DataLoader {
  constructor() {
    this._cache = new Map();
    this._loading = new Map();
    this.onProgress = null;
    this._totalBytes = 0;
    this._loadedBytes = 0;
  }

  // Load a JSON file, returning cached result if available
  async load(url) {
    if (this._cache.has(url)) {
      return this._cache.get(url);
    }

    // Deduplicate concurrent requests
    if (this._loading.has(url)) {
      return this._loading.get(url);
    }

    const promise = this._fetch(url);
    this._loading.set(url, promise);

    try {
      const data = await promise;
      this._cache.set(url, data);
      return data;
    } finally {
      this._loading.delete(url);
    }
  }

  async _fetch(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      this._totalBytes += parseInt(contentLength, 10);
    }

    // Stream for progress if supported
    if (response.body && this.onProgress) {
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        this._loadedBytes += value.length;
        this._reportProgress();
      }

      const body = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
      return JSON.parse(new TextDecoder().decode(body));
    }

    return response.json();
  }

  _reportProgress() {
    if (this.onProgress && this._totalBytes > 0) {
      this.onProgress(this._loadedBytes / this._totalBytes);
    }
  }

  // Preload multiple files in parallel
  async preload(urls) {
    return Promise.all(urls.map(url => this.load(url)));
  }

  // Clear cache
  clear() {
    this._cache.clear();
  }

  isCached(url) {
    return this._cache.has(url);
  }
}

// Singleton loader instance
export const dataLoader = new DataLoader();

// Priority-based loading order for startup
export const LOAD_PRIORITY = {
  CRITICAL: ['data/gems.json'],
  HIGH: ['data/tree.json', 'data/bases.json'],
  LOW: ['data/uniques.json', 'data/mods.json'],
};

// Load data in priority order with progress callback
export async function loadDataWithPriority(onProgress) {
  const loader = dataLoader;
  loader.onProgress = onProgress;

  // Critical data first (needed immediately)
  await loader.preload(LOAD_PRIORITY.CRITICAL);
  if (onProgress) onProgress(0.3);

  // High priority (needed for first render)
  await loader.preload(LOAD_PRIORITY.HIGH);
  if (onProgress) onProgress(0.7);

  // Low priority (can be deferred)
  await loader.preload(LOAD_PRIORITY.LOW);
  if (onProgress) onProgress(1.0);
}
