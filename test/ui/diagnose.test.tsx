import { describe, expect, it } from 'vitest';
import { diagnose } from '../../src/ui/features/settings/diagnose.js';

describe('diagnose', () => {
  it('explains an unknown host and adds Docker tips for host.docker.internal', () => {
    const d = diagnose('host host.docker.internal not found', 'http://host.docker.internal:8096');
    expect(d.title).toBe('Can’t find the host “host.docker.internal”');
    expect(d.field).toBe('url');
    expect(d.tips).toHaveLength(4);
    expect(diagnose('host jf not found', 'http://jf:8096').tips).toHaveLength(2);
  });

  it('separates a refused connection from a rejected key', () => {
    expect(diagnose('connection refused', 'http://x').title).toBe(
      'Nothing answers at that address',
    );
    expect(diagnose('Jellyfin rejected the API key.', 'http://x').field).toBe('key');
  });

  it('falls back to the raw message', () => {
    expect(diagnose('timeout', 'http://x')).toMatchObject({ text: 'timeout', field: 'url' });
  });
});
