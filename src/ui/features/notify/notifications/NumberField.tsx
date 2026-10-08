import { useEffect, useState, type ReactNode } from 'react';
import { Field } from '../../../components/index.js';

export function NumberField({
  label,
  unit,
  value,
  onChange,
  help,
  errors,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  help: ReactNode;
  errors: string[];
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <Field label={label} help={help} errors={errors}>
      {({ id, describedBy, invalid }) => (
        <div className="row gap-10">
          <input
            id={id}
            className="input num"
            inputMode="numeric"
            value={text}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            onChange={(e) => {
              setText(e.target.value);
              const n = Number(e.target.value);
              onChange(e.target.value.trim() === '' || !Number.isFinite(n) ? NaN : n);
            }}
          />
          <span className="strong">{unit}</span>
        </div>
      )}
    </Field>
  );
}
