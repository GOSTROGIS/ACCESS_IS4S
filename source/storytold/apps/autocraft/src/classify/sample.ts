// Seeded sampling and selection helpers.
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Takes `n` items round-robin across groups, so every group is represented before any repeats. */
export function spread<T>(xs: T[], group: (x: T) => string, n: number, rand: () => number): T[] {
  const groups = new Map<string, T[]>();
  for (const x of shuffle(xs, rand)) {
    const k = group(x);
    groups.set(k, [...(groups.get(k) ?? []), x]);
  }
  const queues = shuffle([...groups.values()], rand);
  const out: T[] = [];
  while (out.length < n && queues.some((q) => q.length)) {
    for (const q of queues) if (q.length && out.length < n) out.push(q.shift()!);
  }
  return out;
}
