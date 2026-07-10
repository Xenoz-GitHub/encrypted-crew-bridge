interface WindowEntry {
  timestamps: number[];
}

export function createRateLimiter(windowMs: number, maxRequests: number): (clientId: string) => boolean {
  const windows = new Map<string, WindowEntry>();

  return function allowRequest(clientId: string): boolean {
    const now = Date.now();
    let entry = windows.get(clientId);
    if (!entry) {
      entry = { timestamps: [] };
      windows.set(clientId, entry);
    }
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);
    if (entry.timestamps.length >= maxRequests) {
      return false;
    }
    entry.timestamps.push(now);
    return true;
  };
}
