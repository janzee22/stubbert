import type { MessageKind, MessageTemplate } from '../shared/notify.js';

const LINKS = `{% if links.tmdb or links.jellyfin %}
Links:
{% if links.tmdb %}
[TMDb]({{ links.tmdb }})
{% endif %}
{% if links.jellyfin %}
[Jellyfin]({{ links.jellyfin }})
{% endif %}
{% endif %}`;

const OVERVIEW = `{% if item.overview %}
{{ item.overview | truncate(180) }}

{% endif %}`;

export const DEFAULT_COLOR = '#FFBE2E';

export const DEFAULT_TEMPLATES: Record<MessageKind, MessageTemplate> = {
  movie: {
    title: '{{ item.name }}{% if item.year %} ({{ item.year }}){% endif %} is available',
    content: `${OVERVIEW}
${LINKS}`,
    image: 'poster',
    color: DEFAULT_COLOR,
  },
  episode: {
    title:
      '{{ series.name }} S{{ season.number | pad(2) }}E{{ episode.number | pad(2) }} is available',
    content: LINKS,
    image: 'poster',
    color: DEFAULT_COLOR,
  },
  episodes: {
    title: '{{ series.name }}: {{ episodes | length }} new episodes',
    content: `Season {{ season.number }} · episodes {{ episodes | map(attribute='number') | join(', ') }}

${LINKS}`,
    image: 'poster',
    color: DEFAULT_COLOR,
  },
  season: {
    title: '{{ series.name }} Season {{ season.number }} is available',
    content: `${OVERVIEW}
${LINKS}`,
    image: 'poster',
    color: DEFAULT_COLOR,
  },
};

export const TEST_MESSAGE = {
  title: 'Stubbert is connected',
  description: 'This is a test message. New movies and episodes from Jellyfin will show up here.',
};
