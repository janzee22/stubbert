import { useState } from 'react';
import { Banner, ErrorText, Icon } from '../../components/index.js';
import { useAction } from '../../hooks/useAction.js';
import { api, type MarkExistingResult } from '../../lib/api.js';

const count = (n: number, noun: string) => `${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'}`;

export function ExistingStep({ done }: { done: () => void }) {
  const [result, setResult] = useState<MarkExistingResult>();
  const action = useAction();
  const mark = async () => setResult(await action.run(() => api.markExistingAnnounced()));

  if (result) {
    return (
      <div className="col gap-22">
        <Banner kind="ok" icon="check" title="Existing titles marked as known">
          {count(result.movies, 'movie')} and {count(result.episodes, 'episode')}. A quality upgrade
          of these won’t be announced on Discord.
        </Banner>
        <button type="button" className="btn btn--primary btn--lg btn--block" onClick={done}>
          Finish
        </button>
      </div>
    );
  }
  return (
    <div className="col gap-22">
      <p className="help">
        Stubbert recognises an upgrade by titles it announced before. Titles already in Jellyfin
        were never announced, so their first upgrade would look new. Marking them now prevents that.
        New titles are still announced.
      </p>
      <ErrorText error={action.error} />
      <div className="row wrap gap-12">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => void mark()}
          disabled={action.busy}
        >
          <Icon name="check" />
          {action.busy ? 'Reading the library…' : 'Mark existing titles'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={done} disabled={action.busy}>
          Skip
        </button>
      </div>
    </div>
  );
}
