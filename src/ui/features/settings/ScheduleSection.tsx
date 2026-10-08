import { Field, Icon, SetRow, Toggle } from '../../components/index.js';
import { when } from '../../lib/format.js';
import { useDraft } from '../../state/draft.js';
import { useStatus } from '../../state/status.js';

export function ScheduleSection({ errorsAt }: { errorsAt: (path: string) => string[] }) {
  const { draft, setDraft } = useDraft();
  const { status } = useStatus();
  const at = errorsAt;
  const setSchedule = (change: Partial<typeof draft.schedule>) =>
    setDraft((d) => ({ ...d, schedule: { ...d.schedule, ...change } }));
  return (
    <SetRow id="schedule" title="Schedule" intro="When the app syncs on its own.">
      <Toggle checked={draft.schedule.enabled} onChange={(enabled) => setSchedule({ enabled })}>
        Sync automatically
      </Toggle>
      <Field
        label="Every"
        help={
          status?.nextRunAt
            ? `5 minutes or more. Next sync at ${when(status.nextRunAt)}.`
            : '5 minutes or more.'
        }
        errors={at('schedule.intervalMinutes')}
      >
        {({ id, describedBy, invalid }) => (
          <div className="row gap-10">
            <input
              id={id}
              className="input num"
              style={{ width: 110 }}
              type="number"
              inputMode="numeric"
              min={5}
              step={5}
              value={draft.schedule.intervalMinutes}
              disabled={!draft.schedule.enabled}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => setSchedule({ intervalMinutes: Number(e.target.value) })}
            />
            <span className="strong">minutes</span>
          </div>
        )}
      </Field>
      <Toggle
        checked={draft.schedule.syncOnStart}
        disabled={!draft.schedule.enabled}
        onChange={(syncOnStart) => setSchedule({ syncOnStart })}
      >
        Also sync when the app starts
      </Toggle>
      <div className="col gap-6">
        <Toggle
          checked={draft.schedule.syncOnNewItems}
          disabled={!draft.schedule.enabled}
          onChange={(syncOnNewItems) => setSchedule({ syncOnNewItems })}
        >
          Also sync when Jellyfin reports new items
        </Toggle>
        <p className="help">
          Two minutes after the last new movie or episode, so a big import syncs once. Needs the
          Jellyfin webhook from <a href="#/notifications">Notifications</a>; Discord messages can
          stay off.
        </p>
      </div>
      <p className="help row gap-6">
        <Icon name="shield" size={16} />
        Scheduled syncs apply their changes, and the safety guards always stay on.
      </p>
    </SetRow>
  );
}
