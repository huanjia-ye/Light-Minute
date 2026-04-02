import { getBrowserStorage } from './browserStorage';

describe('browser storage fallback', () => {
  it('falls back to in-memory storage when localStorage is blocked', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    const storage = getBrowserStorage();
    storage.setItem('demo', 'value');

    expect(storage.getItem('demo')).toBe('value');

    if (originalDescriptor) {
      Object.defineProperty(window, 'localStorage', originalDescriptor);
    }
  });
});
