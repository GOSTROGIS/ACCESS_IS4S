import { cn } from "../cn";

// Square initials tile; no remote avatars (strict CSP, no external requests).
const HUES = [222, 186, 22, 322, 46, 262, 150];
export function Avatar({ login, size = 20, className }: { login: string; size?: number; className?: string }) {
  const h = HUES[[...login].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: `hsl(${h} 55% 45% / 0.2)`, color: `hsl(${h} 70% var(--st-avatar-l))`, boxShadow: `inset 0 0 0 1px hsl(${h} 60% 50% / 0.5)` }}
    >
      {login.replace(/[^a-z0-9]/gi, "").slice(0, 2)}
    </span>
  );
}
