import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DiscordMarkdown } from '../../src/ui/features/notify/markdown.js';

describe('Discord markdown', () => {
  it('renders links, nested formatting and plain text', () => {
    const html = renderToStaticMarkup(
      <DiscordMarkdown text={'Links:\n[**TMDb**](https://tmdb.org/1) and `x`'} />,
    );
    expect(html).toContain('<a class="dc-link" href="https://tmdb.org/1"');
    expect(html).toContain('<strong>TMDb</strong>');
    expect(html).toContain('<code class="dc-code">x</code>');
  });
});
