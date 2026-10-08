import type { ReactNode } from 'react';
import { BrandMark, Icon } from '../../../components/index.js';
import type { NotifyStatusView } from '../../../lib/api.js';
import { discordStep, jellyfinStep, middleStep, STEP_ICONS, type StepKind } from './steps.js';

function Step({
  kind,
  icon,
  title,
  line,
  detail,
}: {
  kind: StepKind;
  icon: ReactNode;
  title: string;
  line: string;
  detail: string;
}) {
  return (
    <div className="pipe__step">
      <span className="pipe__icon">
        {icon}
        <span className={`check-ico check-ico--${kind}`}>
          <Icon name={STEP_ICONS[kind]} size={13} strokeWidth={3} />
          <span className="sr-only">{kind === 'ok' ? 'Working: ' : 'Attention: '}</span>
        </span>
      </span>
      <div className="col gap-2 min-w-0">
        <span className="strong">{title}</span>
        <span className="small">{line}</span>
        <span className="micro muted">{detail}</span>
      </div>
    </div>
  );
}

export function Pipeline({ status, enabled }: { status: NotifyStatusView; enabled: boolean }) {
  return (
    <div className="pipe" role="group" aria-label="How notifications flow">
      <Step
        icon={<Icon name="server" size={24} />}
        title="Jellyfin webhook"
        {...jellyfinStep(status.webhook)}
      />
      <span className="pipe__arrow" aria-hidden="true">
        <Icon name="arrowRight" size={22} />
      </span>
      <Step
        icon={<BrandMark size={30} />}
        title="Stubbert groups & filters"
        {...middleStep(status, enabled)}
      />
      <span className="pipe__arrow" aria-hidden="true">
        <Icon name="arrowRight" size={22} />
      </span>
      <Step
        icon={<Icon name="message" size={24} />}
        title="Discord"
        {...discordStep(status.discord)}
      />
    </div>
  );
}
