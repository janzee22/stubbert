import { describe, expect, it } from 'vitest';
import {
  clip,
  ifConditions,
  render,
  tidy,
  validate,
  type Value,
} from '../../src/notify/template/index.js';

const ctx: Record<string, Value> = {
  item: { name: 'Dune', year: 2021, overview: 'A noble family becomes embroiled in a war.' },
  series: { name: "The Handmaid's Tale" },
  season: { number: 6, name: 'Season 6', episode_count: 10 },
  episodes: [
    { season: 6, number: 1, name: 'Train' },
    { season: 6, number: 2, name: 'Surrender' },
  ],
  links: { tmdb: 'https://tmdb/1', imdb: null, jellyfin: 'https://jf/web' },
};

describe('render', () => {
  it('prints values, filters and attributes', () => {
    expect(render('{{ item.name }} ({{ item.year }})', ctx)).toBe('Dune (2021)');
    expect(render('S{{ season.number | pad(2) }}', ctx)).toBe('S06');
    expect(render("{{ episodes | map(attribute='number') | join(', ') }}", ctx)).toBe('1, 2');
    expect(render('{{ episodes | length }}', ctx)).toBe('2');
    expect(render('{{ item.name | upper }} {{ item.name | lower }}', ctx)).toBe('DUNE dune');
    expect(render('{{ links.imdb | default("none") }}', ctx)).toBe('none');
    expect(render('{{ series.name ~ "!" }}', ctx)).toBe("The Handmaid's Tale!");
  });

  it('truncates on a word boundary', () => {
    expect(render('{{ item.overview | truncate(20) }}', ctx)).toBe('A noble family…');
    expect(render('{{ item.name | truncate(20) }}', ctx)).toBe('Dune');
  });

  it('prints null as nothing', () => {
    expect(render('[{{ links.imdb }}]', ctx)).toBe('[]');
  });

  it('runs if, elif, else and for', () => {
    const tpl = '{% if links.imdb %}imdb{% elif links.tmdb %}tmdb{% else %}none{% endif %}';
    expect(render(tpl, ctx)).toBe('tmdb');
    expect(render('{% for e in episodes %}{{ loop.index }}:{{ e.name }} {% endfor %}', ctx)).toBe(
      '1:Train 2:Surrender',
    );
    expect(render('{% for e in [] %}x{% else %}empty{% endfor %}', ctx)).toBe('empty');
    expect(render('{% if season.number > 5 and not links.imdb %}yes{% endif %}', ctx)).toBe('yes');
    expect(render('{% if 2 in episodes | map(attribute="number") %}yes{% endif %}', ctx)).toBe(
      'yes',
    );
  });

  it('honours whitespace control and comments', () => {
    expect(render('a  {%- if true -%}  b  {%- endif -%}  c{# note #}', ctx)).toBe('abc');
  });

  it('leaves no gaps where if-blocks render nothing', () => {
    const tpl = 'Title\n{% if links.imdb %}\nIMDb\n{% endif %}\n\n\nLinks:   \n';
    expect(render(tpl, ctx)).toBe('Title\n\nLinks:');
  });

  it('fails on unknown names at render time', () => {
    expect(() => render('{{ seasn.number }}', ctx)).toThrow('Line 1: there is no `seasn`.');
    expect(() => render('{{ item.nope }}', ctx)).toThrow('there is no `item.nope`');
  });

  it('cannot reach JavaScript internals', () => {
    expect(() => render('{{ item.constructor }}', ctx)).toThrow('there is no `item.constructor`');
    expect(() => render('{{ item.name.length }}', ctx)).toThrow('there is no `item.name.length`');
    expect(() => render('{{ item.__proto__ }}', ctx)).toThrow('there is no `item.__proto__`');
    expect(() => render('{{ episodes.map }}', ctx)).toThrow('there is no `episodes.map`');
  });

  it('limits output size', () => {
    const big: Record<string, Value> = { xs: Array.from({ length: 5000 }, () => 'x'.repeat(10)) };
    expect(() => render('{% for x in xs %}{{ x }}{% endfor %}', big)).toThrow('too much text');
  });
});

describe('validate', () => {
  it('reports syntax errors with line numbers', () => {
    expect(validate('ok\n{% if item.name %}\nmissing end', ctx)[0]?.message).toBe(
      'Line 2: `{% if %}` is never closed with `{% endif %}`.',
    );
    expect(validate('a\nb {{ item.name ', ctx)[0]?.message).toBe(
      'Line 2: `{{` has no closing `}}`.',
    );
    expect(validate('{% endif %}', ctx)[0]?.message).toBe(
      'Line 1: `{% endif %}` without an open `{% if %}`.',
    );
    expect(validate('{% while x %}', ctx)[0]?.message).toBe(
      'Line 1: `{% while %}` is not supported.',
    );
  });

  it('reports unknown names with a suggestion', () => {
    const src = 'a\nb\nc\n{{ episodes | length }} episodes of season {{ seasn.number }}';
    const [issue] = validate(src, ctx);
    expect(issue).toMatchObject({
      kind: 'unknown',
      line: 4,
      message: 'Line 4: there is no `seasn`. Did you mean `season.number`?',
      found: 'seasn.number',
      suggestion: 'season.number',
    });
    expect(src.slice(issue?.start, issue?.end)).toBe('seasn.number');
  });

  it('checks inside branches that the sample would skip', () => {
    const [issue] = validate('{% if false %}{{ item.yeer }}{% endif %}', ctx);
    expect(issue?.suggestion).toBe('item.year');
  });

  it('knows loop variables', () => {
    expect(
      validate('{% for e in episodes %}{{ e.number }}{{ loop.index }}{% endfor %}', ctx),
    ).toEqual([]);
    expect(validate('{% for e in episodes %}{{ e.nmber }}{% endfor %}', ctx)[0]?.message).toContain(
      'there is no `e.nmber`',
    );
  });

  it('reports unknown filters', () => {
    expect(validate('{{ item.name | uper }}', ctx)[0]?.message).toBe(
      'Line 1: there is no filter `uper`. Did you mean `upper`?',
    );
  });

  it('accepts is defined on unknown names', () => {
    expect(validate('{% if episode is defined %}x{% endif %}', ctx)).toEqual([]);
  });
});

describe('tidy and clip', () => {
  it('tidies whitespace', () => {
    expect(tidy('\n a  \n\n\n\n b\t\n')).toBe('a\n\n b');
  });

  it('clips on a word boundary', () => {
    expect(clip('hello brave new world', 12)).toBe('hello brave…');
    expect(clip('short', 12)).toBe('short');
    expect(clip('x'.repeat(20), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('block-only lines', () => {
  it('drop lines that only hold tags, so if-blocks leave no gaps', () => {
    const tpl =
      'A\n{% if links.imdb %}\nIMDb\n{% endif %}\n{% if links.tmdb %}\nTMDb\n{% endif %}\nB';
    expect(render(tpl, ctx)).toBe('A\nTMDb\nB');
  });

  it('keeps text that shares a line with a tag', () => {
    expect(render('{% if links.tmdb %}yes{% endif %}\nnext', ctx)).toBe('yes\nnext');
  });
});

describe('ifConditions', () => {
  it('lists the plain paths an if tests, including nested ones', () => {
    const source = `{% if links.imdb %}a{% elif item.name %}b{% endif %}
{%- if item.overview -%}{% if season.name %}c{% endif %}{%- endif %}
{% if item.year > 2000 %}d{% endif %}`;
    expect(ifConditions(source)).toEqual(['links.imdb', 'item.overview', 'season.name']);
  });

  it('skips loop variables', () => {
    const source = '{% for ep in episodes %}{% if ep.name %}{{ ep.name }}{% endif %}{% endfor %}';
    expect(ifConditions(source)).toEqual([]);
  });
});
