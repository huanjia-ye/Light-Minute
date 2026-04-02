import { getRouterMode } from './routerMode';

describe('router mode', () => {
  it('uses hash routing for file protocol', () => {
    expect(getRouterMode('file:')).toBe('hash');
  });

  it('uses browser routing for http-like protocols', () => {
    expect(getRouterMode('http:')).toBe('browser');
    expect(getRouterMode('https:')).toBe('browser');
    expect(getRouterMode(undefined)).toBe('browser');
  });
});
