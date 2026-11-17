let now = () => Date.now();
/** The mock's fixtures are dated around a frozen moment, so screenshots stay stable; it sets the clock to match. */
export function setClock(fn: () => number) {
  now = fn;
}

export function ago(isoTime: string, short = true): string {
  const s = Math.max(0, (now() - Date.parse(isoTime)) / 1000);
  const [n, u] = s < 60 ? [s, "s"] : s < 3600 ? [s / 60, "m"] : s < 86400 ? [s / 3600, "h"] : [s / 86400, "d"];
  const v = Math.floor(n);
  if (short) return `${v}${u}`;
  const word = { s: "second", m: "minute", h: "hour", d: "day" }[u]!;
  return `${v} ${word}${v === 1 ? "" : "s"} ago`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * An event time for reading: "now", "12m ago", then the local clock time ("14:32") for the rest of today,
 * "yesterday 14:32", "Nov 3 14:32" earlier this year and "Nov 3 2025" before that. Times in the future read as "now".
 */
export function eventTime(isoTime: string): string {
  const t = Date.parse(isoTime);
  const s = Math.max(0, (now() - t) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  const d = new Date(t), n = new Date(now());
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(n) - midnight(d)) / 86400_000);
  if (days <= 0) return clock(t);
  if (days === 1) return `yesterday ${clock(t)}`;
  const md = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === n.getFullYear() ? `${md} ${clock(t)}` : `${md} ${d.getFullYear()}`;
}

export const num = (n: number) => n.toLocaleString("en");
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

export const ageDays = (isoTime: string) => (now() - Date.parse(isoTime)) / 86400_000;

/** The current time in ms on the app's clock (frozen in the mock). */
export const nowMs = () => now();

/** "2 h 40 m" / "35 m" / "3 d 4 h" for a span in ms. */
export function span(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "<1 m";
  if (m < 60) return `${m} m`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${m % 60} m`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Short name of the viewer's time zone at a moment (default: now), e.g. "CET" or "GMT+8". */
export const zoneName = (at: Date | string | number = now()) =>
  new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date(at)).find((p) => p.type === "timeZoneName")?.value ?? "";

/** "2026-11-02" in the viewer's time zone. */
export const day = (iso: string | null | undefined) => {
  if (!iso) return "–";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** "10:40" (24 h) in the viewer's time zone. */
export const clock = (iso: string | number) => {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** "2026-11-02 10:40" in the viewer's time zone. */
export const when = (iso: string | null | undefined) => (iso ? `${day(iso)} ${clock(iso)}` : "–");

/** The server's daily limits reset at 00:00 UTC; this is that moment as "09:00" in the viewer's time zone. */
export const dayResetLocal = () => {
  const d = new Date(now());
  const reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return clock(reset);
};

/** Memory size for a step's peak: "812 MB", "5.8 GB". */
export const memSize = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);
