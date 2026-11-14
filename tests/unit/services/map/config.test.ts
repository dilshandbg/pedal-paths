import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STYLE_URL, getMapStyleUrl } from '@/services/map';

describe('getMapStyleUrl', () => {
  it('uses the free OpenFreeMap style by default', () => {
    expect(getMapStyleUrl({})).toBe(DEFAULT_MAP_STYLE_URL);
    expect(DEFAULT_MAP_STYLE_URL).toMatch(/^https:\/\//);
  });

  it('uses a configured https style URL, trimmed', () => {
    expect(getMapStyleUrl({ VITE_MAP_STYLE_URL: '  https://example.org/style.json \n' })).toBe(
      'https://example.org/style.json',
    );
  });

  it.each([
    ['blank', '   '],
    ['not a URL', 'not a url'],
    ['a non-http protocol', 'javascript:alert(1)'],
    ['a file URL', 'file:///etc/style.json'],
  ])('falls back to the default when the value is %s', (_label, value) => {
    expect(getMapStyleUrl({ VITE_MAP_STYLE_URL: value })).toBe(DEFAULT_MAP_STYLE_URL);
  });
});
