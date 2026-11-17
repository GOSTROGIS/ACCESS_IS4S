import { cn } from "../cn";

export function Segmented<T extends string>({ value, options, onChange, label, className }: { value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex items-center gap-1", className)}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} data-active={value === o.value} className="chip" onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="opacity-60">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
