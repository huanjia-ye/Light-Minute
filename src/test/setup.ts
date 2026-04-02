import '@testing-library/jest-dom/vitest';

const storageState = new Map<string, string>();

const localStorageMock: Storage = {
  getItem: vi.fn((key: string) => storageState.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storageState.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    storageState.delete(key);
  }),
  clear: vi.fn(() => {
    storageState.clear();
  }),
  key: vi.fn((index: number) => Array.from(storageState.keys())[index] ?? null),
  get length() {
    return storageState.size;
  },
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
  configurable: true,
});

Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    enumerateDevices: vi.fn().mockResolvedValue([
      { kind: 'audioinput', label: 'Default microphone' },
      { kind: 'audioinput', label: 'USB microphone' },
    ]),
  },
  configurable: true,
});

beforeEach(() => {
  localStorageMock.clear();
  window.localStorage.clear();
  vi.clearAllMocks();
});
