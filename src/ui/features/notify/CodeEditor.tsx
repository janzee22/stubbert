import { useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { highlight } from './highlight.js';

export interface EditorHandle {
  insert: (text: string, caretOffset?: number) => void;
  focus: () => void;
}

function oneLine(v: string): string {
  return v.replace(/\r?\n/g, ' ');
}

export function CodeEditor({
  ref,
  id,
  label,
  value,
  onChange,
  single,
  errors,
  describedBy,
  onFocus,
}: {
  ref?: Ref<EditorHandle>;
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  single?: boolean;
  errors: ReadonlyArray<{ start: number; end: number }>;
  describedBy?: string;
  onFocus?: () => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const lines = useMemo(() => highlight(value, errors), [value, errors]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => area.current?.focus(),
      insert: (text: string, caretOffset = text.length) => {
        const el = area.current;
        const start = el?.selectionStart ?? value.length;
        const end = el?.selectionEnd ?? value.length;
        const joined = value.slice(0, start) + text + value.slice(end);
        const next = single ? oneLine(joined) : joined;
        onChange(next);
        requestAnimationFrame(() => {
          if (!el) return;
          el.focus();
          el.setSelectionRange(start + caretOffset, start + caretOffset);
        });
      },
    }),
    [value, onChange, single],
  );

  return (
    <div
      className={`code code--edit${single ? ' code--line' : ''}${errors.length ? ' is-error' : ''}`}
    >
      <div className="code__hl" aria-hidden="true">
        {lines.map((segs, i) => (
          <div className="code__row" key={i}>
            {!single && <span className="code__num">{i + 1}</span>}
            <span className="code__text">
              {segs.map((s, j) => (
                <span key={j} className={s.c}>
                  {s.t}
                </span>
              ))}
              {'​'}
            </span>
          </div>
        ))}
      </div>
      <textarea
        ref={area}
        id={id}
        className="code__input"
        aria-label={label}
        aria-invalid={errors.length > 0}
        aria-describedby={describedBy}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        rows={single ? 1 : Math.max(lines.length, 4)}
        value={value}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (single && e.key === 'Enter') e.preventDefault();
        }}
        onChange={(e) => onChange(single ? oneLine(e.target.value) : e.target.value)}
      />
    </div>
  );
}
