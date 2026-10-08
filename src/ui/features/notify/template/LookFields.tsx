import { useEffect, useState } from 'react';
import { Icon, Segmented } from '../../../components/index.js';
import type { MessageTemplate } from '../../../lib/api.js';

const SWATCHES = [
  { name: 'Marigold', color: '#FFBE2E' },
  { name: 'Purple', color: '#AA5CC3' },
  { name: 'Cyan', color: '#00A4DC' },
  { name: 'Red', color: '#E0503D' },
];

export function LookFields({
  template,
  update,
}: {
  template: MessageTemplate;
  update: (changes: Partial<MessageTemplate>) => void;
}) {
  const [hexText, setHexText] = useState(template.color);
  useEffect(() => setHexText(template.color), [template.color]);
  return (
    <div className="tpl-look">
      <div className="field">
        <span className="label">Image</span>
        <Segmented
          label="Image"
          options={[
            { value: 'poster', label: 'Poster' },
            { value: 'backdrop', label: 'Backdrop' },
            { value: 'none', label: 'None' },
          ]}
          value={template.image}
          onChange={(image) => update({ image })}
        />
      </div>
      <div className="field">
        <span className="label">Side color</span>
        <div className="row wrap gap-8">
          {SWATCHES.map((s) => {
            const on = template.color.toUpperCase() === s.color;
            return (
              <button
                key={s.color}
                type="button"
                className="swatch"
                aria-pressed={on}
                aria-label={s.name}
                style={{ background: s.color }}
                onClick={() => update({ color: s.color })}
              >
                {on && (
                  <span style={{ color: '#2B1D10' }}>
                    <Icon name="check" size={18} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
          <input
            className="input input--mono"
            aria-label="Custom color"
            value={hexText}
            maxLength={7}
            style={{ width: 120 }}
            aria-invalid={!/^#[0-9a-f]{6}$/i.test(hexText)}
            onChange={(e) => {
              const v = e.target.value.trim();
              setHexText(v);
              if (/^#[0-9a-f]{6}$/i.test(v)) update({ color: v.toUpperCase() });
            }}
          />
        </div>
      </div>
    </div>
  );
}
