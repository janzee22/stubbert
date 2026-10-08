import { Badge, Checkbox, Icon, type IconName, SetRow, Toggle } from '../../../components/index.js';
import type { Library } from '../../../lib/api.js';
import { useNotifyForm } from './form.js';
import { LibraryPicker } from './LibraryPicker.js';
import { NumberField } from './NumberField.js';
import { STEP_ICONS, tmdbState } from './steps.js';
import { StoredSecretInput } from './StoredSecretInput.js';

const OUTCOMES: Array<{ badge: string; icon: IconName; title: string; note?: string }> = [
  { badge: 'A movie', icon: 'film', title: 'Movie message' },
  { badge: '1 episode', icon: 'tv', title: 'Episode message' },
  {
    badge: '2 or more',
    icon: 'list',
    title: 'Episodes message',
    note: 'One message that lists them',
  },
  {
    badge: 'Whole season',
    icon: 'tv',
    title: 'Season message',
    note: 'Only the season, no episode list',
  },
];

export function RulesSection({
  libraries,
  tmdbRejected,
}: {
  libraries: Library[];
  tmdbRejected: boolean | undefined;
}) {
  const { view, draft, prefs: p, set, errorsFor, setSecret } = useNotifyForm();
  const tmdb = tmdbState(tmdbRejected, view.tmdbApiKey.set);
  return (
    <SetRow
      id="notif-rules"
      title="What gets announced"
      intro="Only new things. Upgrades and re-scans stay quiet."
    >
      <div className="field">
        <span className="label">New</span>
        <div className="row wrap gap-18">
          <Checkbox checked={p.movies} onChange={(v) => set('movies', v)}>
            <Icon name="film" /> Movies
          </Checkbox>
          <Checkbox checked={p.episodes} onChange={(v) => set('episodes', v)}>
            <Icon name="tv" /> Episodes and seasons
          </Checkbox>
        </div>
      </div>
      <div className="field">
        <span className="label">From these libraries</span>
        <LibraryPicker
          libraries={libraries}
          value={p.libraryIds}
          onChange={(ids) => set('libraryIds', ids)}
        />
        <p className="help">Leave empty for all libraries.</p>
      </div>
      <NumberField
        label="Send when Jellyfin has been quiet for"
        unit="minutes"
        value={p.quietMinutes}
        onChange={(v) => set('quietMinutes', v)}
        errors={errorsFor('quietMinutes')}
        help="New items wait here first. Every new movie or episode restarts the timer."
      />
      <figure className="sunken quiet-example">
        <figcaption className="micro muted">
          Example: three episodes of a series arrive at 14:12, 14:15 and 14:22. With{' '}
          {Number.isFinite(p.quietMinutes) ? p.quietMinutes : 10} quiet minutes after the last one,
          Stubbert counts 1 title and sends one Episodes message.
        </figcaption>
      </figure>
      <NumberField
        label="Stay quiet when this many titles arrive at once"
        unit="titles or more"
        value={p.bulkThreshold}
        onChange={(v) => set('bulkThreshold', v)}
        errors={errorsFor('bulkThreshold')}
        help="Every movie counts as 1, every series as 1, however many episodes it has. 3 movies and 5 episodes of one series is 4 titles: sent. A full rescan or a big import is skipped, and those titles are never announced later."
      />
      <div className="field">
        <span className="label">Otherwise, one message per title</span>
        <ul className="col gap-0">
          {OUTCOMES.map((o) => (
            <li key={o.title} className="list-row">
              <Badge kind="same" icon={o.icon}>
                {o.badge}
              </Badge>
              <Icon name="arrowRight" />
              <span className="col gap-0">
                <span className="strong">{o.title}</span>
                {o.note && <span className="micro muted">{o.note}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="help">
          “Whole season” means every episode of that season arrived in this one batch. Waiting items
          survive a restart of Stubbert.
        </p>
      </div>
      <div className="field">
        <span className="label">How Stubbert knows how many episodes a season has</span>
        <p className="help">It asks these sources in order and uses the first answer.</p>
        <ol className="col gap-0">
          <li className="list-row">
            <span className="check-ico check-ico--ok">
              <Icon name="check" size={16} strokeWidth={3} />
            </span>
            <div className="col gap-0 grow">
              <span className="strong">1 · Jellyfin</span>
              <span className="small muted">
                Its own metadata, when it lists episodes you don’t have yet. No setup.
              </span>
            </div>
          </li>
          <li className="list-row">
            <span className={`check-ico check-ico--${p.tvmaze ? 'ok' : 'wait'}`}>
              <Icon name={p.tvmaze ? 'check' : 'clock'} size={16} strokeWidth={3} />
            </span>
            <div className="col gap-0 grow">
              <span className="strong">2 · TVmaze</span>
              <span className="small muted">
                Free and needs no key. Looked up by the TVDb or IMDb id. Data from{' '}
                <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer">
                  TVmaze
                </a>{' '}
                (CC BY-SA).
              </span>
            </div>
            <Toggle checked={p.tvmaze} onChange={(v) => set('tvmaze', v)}>
              <span className="sr-only">Use TVmaze</span>
            </Toggle>
          </li>
          <li className="list-row items-start">
            <span className={`check-ico check-ico--${tmdb}`}>
              <Icon name={STEP_ICONS[tmdb]} size={16} strokeWidth={3} />
            </span>
            <div className="col gap-6 grow min-w-0">
              <span className="strong">
                3 · TMDb <span className="muted">optional</span>
              </span>
              <label className="sr-only" htmlFor="notif-tmdb">
                TMDb API key
              </label>
              <StoredSecretInput
                id="notif-tmdb"
                name="tmdbApiKey"
                set={view.tmdbApiKey.set}
                hint={view.tmdbApiKey.hint}
                value={draft.tmdbApiKey}
                placeholder="Paste a TMDb API key"
                describedBy="notif-tmdb-help"
                invalid={tmdbRejected}
                onChange={setSecret}
              />
              {tmdbRejected && (
                <p className="error-msg">
                  <Icon name="alert" size={16} strokeWidth={2.5} />
                  TMDb rejected the API key.
                </p>
              )}
              <p className="help" id="notif-tmdb-help">
                Free at themoviedb.org → Settings → API. Leave empty to skip.
              </p>
            </div>
          </li>
        </ol>
        <p className="help">
          No answer from any source? Then 2 or more episodes get an Episodes message, never a Season
          message.
        </p>
      </div>
      <div className="col gap-6">
        <Toggle checked={p.skipAnnounced} onChange={(v) => set('skipAnnounced', v)}>
          Skip titles that were announced before
        </Toggle>
        <p className="help">
          A quality upgrade or re-scan adds the same title again. Stubbert recognises it by its TMDb
          or TVDb id.
        </p>
      </div>
    </SetRow>
  );
}
