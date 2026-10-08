import { Icon, Select } from '../../../components/index.js';
import { normId, type Library } from '../../../lib/api.js';

export function LibraryPicker({
  libraries,
  value,
  onChange,
}: {
  libraries: Library[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const options = libraries.filter((l) => !l.pluginLibrary && !value.includes(normId(l.id)));
  const name = (id: string) =>
    libraries.find((l) => normId(l.id) === id)?.name ?? 'Unknown library';
  return (
    <div className="picker">
      {value.map((id) => (
        <span key={id} className="chip">
          {name(id)}
          <button
            type="button"
            className="chip__x"
            aria-label={`Remove ${name(id)}`}
            onClick={() => onChange(value.filter((v) => v !== id))}
          >
            <Icon name="close" size={14} strokeWidth={3} />
          </button>
        </span>
      ))}
      {options.length > 0 && (
        <Select
          aria-label="Add library"
          value=""
          className="picker__select"
          onChange={(e) => {
            if (e.target.value) onChange([...value, normId(e.target.value)]);
          }}
        >
          <option value="">Add a library…</option>
          {options.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
