import { useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { cn } from "../cn";
import { Button } from "../atoms/Button";
import { num } from "../../lib/format";

/** Monospace text with a copy button; text longer than `lines` lines is clipped with a "Show all" toggle. */
export function CodeBlock({ title, text, lines = 12, className }: { title?: string; text: string; lines?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const long = text.split("\n").length > lines || text.length > lines * 120;
  const copy = () => void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => undefined);
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex min-h-7 items-center gap-2 text-xs text-ink/60">
        {title && <span className="font-semibold">{title}</span>}
        <span className="num text-ink/45">{num(text.length)} characters</span>
        <Button size="sm" variant="ghost" icon={copied ? CheckIcon : CopyIcon} onClick={copy} className="ml-auto" aria-label={`Copy ${title ?? "text"}`}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre
        className="code overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-sunken p-3 text-xs leading-relaxed"
        style={long && !open ? { maxHeight: `${lines * 1.4}rem` } : { maxHeight: "70vh" }}
      >
        {text}
      </pre>
      {long && (
        <button onClick={() => setOpen(!open)} className="mt-1 text-xs font-medium text-accent-ink hover:underline max-md:min-h-11">
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}
