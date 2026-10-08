import { Icon } from '../../components/index.js';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ValueCount, ValueField } from '../../lib/api.js';
import { useValues } from '../../state/values.js';

const MAX_SUGGESTIONS = 8;

function countLabel(v: ValueCount): string {
  return [v.movies && `${v.movies} movies`, v.series && `${v.series} series`]
    .filter(Boolean)
    .join(' · ');
}

export function useKnownValues(field: ValueField | undefined) {
  const loadValues = useValues();
  const [known, setKnown] = useState<ValueCount[]>();
  useEffect(() => {
    if (!field) return;
    let cancelled = false;
    loadValues(field).then(
      (v) => !cancelled && setKnown(v),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [field, loadValues]);
  return known;
}

export function ValuePicker({
  values,
  onChange,
  field,
  label,
  placeholder,
  invalid,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  field?: ValueField;
  label: string;
  placeholder?: string;
  invalid?: boolean;
}) {
  const known = useKnownValues(field);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const counts = useMemo(() => new Map(known?.map((k) => [k.name.toLowerCase(), k])), [known]);
  const chosen = new Set(values.map((v) => v.toLowerCase()));
  const q = text.trim().toLowerCase();
  const suggestions = (known ?? [])
    .filter((k) => !chosen.has(k.name.toLowerCase()) && (!q || k.name.toLowerCase().includes(q)))
    .toSorted(
      (a, b) =>
        Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) ||
        b.count - a.count,
    )
    .slice(0, MAX_SUGGESTIONS);
  const showList = open && suggestions.length > 0;

  const add = (value: string) => {
    const v = value.trim();
    if (!v || chosen.has(v.toLowerCase())) return;
    onChange([...values, counts.get(v.toLowerCase())?.name ?? v]);
    setText('');
    setActive(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || (e.key === ',' && field)) {
      if (!text.trim() && !showList) return;
      e.preventDefault();
      add(showList && suggestions[active] ? suggestions[active].name : text);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !text && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className={`picker${invalid ? ' is-error' : ''}`} onClick={() => input.current?.focus()}>
      {values.map((v) => {
        const count = counts.get(v.toLowerCase());
        const unknown = !!field && !!known && !count;
        return (
          <span
            key={v}
            className={`chip${unknown ? ' chip--unknown' : ''}`}
            title={unknown ? 'Not in your library' : count && countLabel(count)}
          >
            {v}
            {count && <span className="chip--count num">{count.count}</span>}
            {unknown && <span className="chip--count">not in your library</span>}
            <button
              type="button"
              className="chip__x"
              aria-label={`Remove ${v}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(values.filter((x) => x !== v));
              }}
            >
              <Icon name="close" size={16} strokeWidth={2.5} />
            </button>
          </span>
        );
      })}
      <input
        ref={input}
        className="picker__input"
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        value={text}
        placeholder={values.length ? '' : placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          if (text.trim() && !field) add(text);
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="menu" id={listId} role="listbox" aria-label={`${label} suggestions`}>
          <li className="menu__hint" role="presentation">
            In your library
          </li>
          {suggestions.map((s, i) => (
            <li
              key={s.name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className="menu__opt"
              onMouseDown={(e) => {
                e.preventDefault();
                add(s.name);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{s.name}</span>
              <span className="count num">{countLabel(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
