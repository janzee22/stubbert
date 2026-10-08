import { useState } from 'react';
import { Icon } from './Icon.js';

export function SecretInput({
  id,
  value,
  onChange,
  describedBy,
  invalid,
  autoComplete = 'off',
  placeholder,
  required,
  minLength,
  mono,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
  invalid?: boolean;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  mono?: boolean;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-wrap">
      <input
        id={id}
        className={`input input--secret${mono ? ' input--mono' : ''}`}
        type={visible ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoFocus={autoFocus}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="btn btn--ghost btn--sm input-wrap__action"
        aria-pressed={visible}
        aria-label={visible ? 'Hide' : 'Show'}
        onClick={() => setVisible((v) => !v)}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} />
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
