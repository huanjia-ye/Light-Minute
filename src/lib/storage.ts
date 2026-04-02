import { getBrowserStorage } from './browserStorage';

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const rawValue = getBrowserStorage().getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T) {
  try {
    getBrowserStorage().setItem(key, JSON.stringify(value));
  } catch {
    // Keep the mock MVP usable even when persistent storage is blocked.
  }
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
