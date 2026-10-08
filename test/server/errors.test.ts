import { describe, expect, it } from 'vitest';
import { JellyfinUnreachableError } from '../../src/jellyfin/http.js';
import { toApiError } from '../../src/server/errors.js';

describe('toApiError', () => {
  it('reports an unreachable Jellyfin as 502 jellyfin', () => {
    const cause = Object.assign(new Error('connect'), { code: 'ECONNREFUSED' });
    const err = new JellyfinUnreachableError(
      'http://jellyfin:8096',
      new TypeError('fetch failed', { cause }),
    );
    expect(toApiError(err)).toMatchObject({ status: 502, code: 'jellyfin' });
  });

  it('reports other errors with a cause as internal, not as Jellyfin', () => {
    const err = new Error('data/settings.json is not valid JSON', { cause: new SyntaxError('x') });
    expect(toApiError(err)).toMatchObject({ status: 500, code: 'internal' });
  });
});
