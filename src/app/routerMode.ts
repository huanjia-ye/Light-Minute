export type RouterMode = 'browser' | 'hash';

export function getRouterMode(protocol?: string): RouterMode {
  return protocol === 'file:' ? 'hash' : 'browser';
}
