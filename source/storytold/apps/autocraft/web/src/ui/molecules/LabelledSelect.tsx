import { Select } from "../atoms/Select";

/** A select with its label in front, for filter bars. */
export function LabelledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink/60">
      {label}
      <Select size="sm" value={value} onChange={(e) => onChange(e.target.value)} className="px-1.5 text-ink max-md:h-7">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
