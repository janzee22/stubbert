import { useState } from 'react';
import { copyText } from '../lib/clipboard.js';
import { Icon } from './Icon.js';

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copyfield" role="group" aria-label={label}>
      <span className="copyfield__val">{value}</span>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        onClick={() => {
          void copyText(value).then((ok) => {
            if (!ok) return;
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
