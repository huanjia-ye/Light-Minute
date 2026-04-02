const memoryStorageState = new Map<string, string>();

const memoryStorage: Storage = {
  getItem: (key: string) => memoryStorageState.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStorageState.set(key, value);
  },
  removeItem: (key: string) => {
    memoryStorageState.delete(key);
  },
  clear: () => {
    memoryStorageState.clear();
  },
  key: (index: number) => Array.from(memoryStorageState.keys())[index] ?? null,
  get length() {
    return memoryStorageState.size;
  },
};

export function getBrowserStorage(): Storage {
  if (typeof window === 'undefined') {
    return memoryStorage;
  }

  try {
    const { localStorage } = window;
    const probeKey = '__light-minute-storage-probe__';
    localStorage.setItem(probeKey, 'ok');
    localStorage.removeItem(probeKey);
    return localStorage;
  } catch {
    return memoryStorage;
  }
}
