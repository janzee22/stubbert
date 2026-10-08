import { describe, expect, it } from 'vitest';
import { highlight } from '../../src/ui/features/notify/highlight.js';

describe('template highlighting', () => {
  it('colours variables, filters, tags and markdown per line', () => {
    const src =
      '{% if item.overview %}\n{{ item.overview | truncate(180) }}\n[TMDb]({{ links.tmdb }})';
    expect(highlight(src)).toEqual([
      [{ c: 'tk-tag', t: '{% if item.overview %}' }],
      [
        { c: 'tk-var', t: '{{ item.overview ' },
        { c: 'tk-filter', t: '| truncate(180) ' },
        { c: 'tk-var', t: '}}' },
      ],
      [
        { c: 'tk-md', t: '[' },
        { c: 'tk-text', t: 'TMDb' },
        { c: 'tk-md', t: '](' },
        { c: 'tk-var', t: '{{ links.tmdb }}' },
        { c: 'tk-md', t: ')' },
      ],
    ]);
  });

  it('marks error ranges', () => {
    const src = 'of season {{ seasn.number }}';
    const start = src.indexOf('seasn');
    expect(highlight(src, [{ start, end: start + 'seasn.number'.length }])).toEqual([
      [
        { c: 'tk-text', t: 'of season ' },
        { c: 'tk-var', t: '{{ ' },
        { c: 'tk-err', t: 'seasn.number' },
        { c: 'tk-var', t: ' }}' },
      ],
    ]);
  });

  it('keeps empty lines', () => {
    expect(highlight('a\n\nb')).toEqual([
      [{ c: 'tk-text', t: 'a' }],
      [],
      [{ c: 'tk-text', t: 'b' }],
    ]);
  });
});
