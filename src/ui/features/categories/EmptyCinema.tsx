import { Icon, Stubbert } from '../../components/index.js';
import type { Rule } from '../../lib/tree.js';

interface Starter {
  type: Rule['type'];
  label: string;
}

const STARTERS: Starter[] = [
  { type: 'genre', label: 'A genre' },
  { type: 'studio', label: 'A studio' },
  { type: 'name', label: 'A title word' },
];

export function EmptyCinema({ onCreate }: { onCreate: (rule?: Rule['type']) => void }) {
  return (
    <div className="empty-state">
      <Stubbert mood="searching" />
      <h2 className="h1">Your cinema is still empty</h2>
      <p className="muted">
        A category turns into a collection in Jellyfin. Start with one you already know, like Horror
        or Studio Ghibli.
      </p>
      <button type="button" className="btn btn--primary btn--lg" onClick={() => onCreate()}>
        <Icon name="plus" size={20} />
        Create your first category
      </button>
      <div className="row wrap gap-8 justify-center">
        <span className="small muted">Or start from:</span>
        {STARTERS.map((s) => (
          <button
            key={s.type}
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => onCreate(s.type)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
