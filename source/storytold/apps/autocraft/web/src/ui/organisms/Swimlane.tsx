import { EDGES, LANES, STEPS, type Edge, type Step } from "./swimlaneDef";

// Swimlane view of the pipeline: lanes are columns, steps are cards, arrows are
// the hand-offs. Drawn as inline SVG; all styling comes from classes in
// app.css (the dashboard CSP allows no inline style), so the design tokens
// drive both themes. Wider than a phone: the frame scrolls sideways.

const COL_W = 220;
const CARD_W = 190;
const CARD_H = 62;
const ROW_PITCH = 170;
const PAD_X = 16;
const HEAD_H = 36;
const TOP = HEAD_H + 22;

type Pt = [number, number];

const laneIndex = new Map(LANES.map((l, i) => [l.id, i]));
const stepById = new Map(STEPS.map((s) => [s.id, s]));
const colOf = (s: Step) => laneIndex.get(s.lane) ?? 0;
const cx = (s: Step) => PAD_X + colOf(s) * COL_W + COL_W / 2;
const cardTop = (s: Step) => TOP + s.row * ROW_PITCH;
const gutterX = (g: number) => PAD_X + g * COL_W;
// Boundary b is the channel between row b-1 and row b.
const boundaryY = (b: number) => TOP + b * ROW_PITCH - (ROW_PITCH - CARD_H) / 2;

interface Route {
  edge: Edge;
  from: Step;
  to: Step;
  down: boolean;
  b1: number;
  b2: number;
  gutter: number;
}

function spread(index: number, count: number, step: number): number {
  return (index - (count - 1) / 2) * step;
}

// An edge that stays in its column with no card between its ends is drawn as one straight line.
function sameColumnStraight(r: Route): boolean {
  if (colOf(r.from) !== colOf(r.to)) return false;
  const lo = Math.min(r.from.row, r.to.row);
  const hi = Math.max(r.from.row, r.to.row);
  return !STEPS.some((s) => s !== r.from && s !== r.to && s.lane === r.from.lane && s.row > lo && s.row < hi);
}

function buildRoutes(): { route: Route; pts: Pt[] }[] {
  const routes: Route[] = EDGES.map((edge) => {
    const from = stepById.get(edge.from)!;
    const to = stepById.get(edge.to)!;
    const down = to.row > from.row || (to.row === from.row && colOf(to) > colOf(from));
    const b1 = down ? from.row + 1 : from.row;
    const b2 = down ? to.row : to.row + 1;
    const sc = colOf(from);
    const tc = colOf(to);
    const gutter = tc > sc ? tc : tc < sc ? tc + 1 : sc + 1;
    return { edge, from, to, down, b1, b2, gutter };
  });

  // Ports along a card's top or bottom edge, ordered by where the other end is.
  const ports = new Map<string, { r: Route; end: "s" | "t"; other: number }[]>();
  const add = (step: Step, side: "top" | "bottom", r: Route, end: "s" | "t", other: Step) => {
    const k = step.id + side;
    if (!ports.has(k)) ports.set(k, []);
    ports.get(k)!.push({ r, end, other: cx(other) });
  };
  for (const r of routes) {
    add(r.from, r.down ? "bottom" : "top", r, "s", r.to);
    add(r.to, r.down ? "top" : "bottom", r, "t", r.from);
  }
  const take = (m: Map<number, number>, k: number) => {
    const n = m.get(k) ?? 0;
    m.set(k, n + 1);
    return n;
  };
  const portX = new Map<string, number>();
  for (const list of ports.values()) {
    const first = list[0];
    const step = first.end === "s" ? first.r.from : first.r.to;
    const c = cx(step);
    const hasMain = list.some((p) => p.r.edge.main && sameColumnStraight(p.r));
    list.sort((a, b) => a.other - b.other);
    if (!hasMain) {
      list.forEach((p, i) => portX.set(`${p.r.edge.from}>${p.r.edge.to}${p.end}`, c + spread(i, list.length, 16)));
      continue;
    }
    // The straight main edge keeps the card's centre; the others sit to the side their other end is on.
    const left = list.filter((p) => !(p.r.edge.main && sameColumnStraight(p.r)) && p.other < c);
    const right = list.filter((p) => !(p.r.edge.main && sameColumnStraight(p.r)) && p.other >= c);
    for (const p of list.filter((p) => p.r.edge.main && sameColumnStraight(p.r))) portX.set(`${p.r.edge.from}>${p.r.edge.to}${p.end}`, c);
    left.reverse().forEach((p, i) => portX.set(`${p.r.edge.from}>${p.r.edge.to}${p.end}`, c - 16 * (i + 1)));
    right.forEach((p, i) => portX.set(`${p.r.edge.from}>${p.r.edge.to}${p.end}`, c + 16 * (i + 1)));
  }

  // Gutter slots, so parallel vertical runs do not overlap.
  const gutterUse = new Map<number, number>();
  const gutterTotal = new Map<number, number>();
  for (const r of routes) if (r.b1 !== r.b2 && !sameColumnStraight(r)) gutterTotal.set(r.gutter, (gutterTotal.get(r.gutter) ?? 0) + 1);

  interface Run {
    key: string;
    b: number;
    x0: number;
    x1: number;
    /** x positions where a vertical leaves the run upward or downward. */
    up: number[];
    down: number[];
  }
  const geo = new Map<string, { sx: number; tx: number; sy: number; ty: number; gx: number | null; r: Route }>();
  const runs = new Map<number, Run[]>();
  const addRun = (run: Run) => (runs.get(run.b) ?? runs.set(run.b, []).get(run.b)!).push(run);
  for (const r of routes) {
    if (sameColumnStraight(r)) continue;
    const key = `${r.edge.from}>${r.edge.to}`;
    const sx = portX.get(key + "s")!;
    const tx = portX.get(key + "t")!;
    const sy = r.down ? cardTop(r.from) + CARD_H : cardTop(r.from);
    const ty = r.down ? cardTop(r.to) : cardTop(r.to) + CARD_H;
    const gx = r.b1 !== r.b2 ? gutterX(r.gutter) + spread(take(gutterUse, r.gutter), gutterTotal.get(r.gutter) ?? 1, 4) : null;
    geo.set(key, { sx, tx, sy, ty, gx, r });
    // The source card is above its channel for a downward edge, below it for an upward one; the target the other way round.
    const srcDir = r.down ? "up" : "down";
    const dstDir = r.down ? "down" : "up";
    const mk = (b: number, xa: number, da: string, xb: number, db: string): Run => {
      const run: Run = { key, b, x0: Math.min(xa, xb), x1: Math.max(xa, xb), up: [], down: [] };
      (da === "up" ? run.up : run.down).push(xa);
      (db === "up" ? run.up : run.down).push(xb);
      return run;
    };
    if (gx === null) addRun(mk(r.b1, sx, srcDir, tx, dstDir));
    else {
      addRun(mk(r.b1, sx, srcDir, gx, r.b2 > r.b1 ? "down" : "up"));
      addRun(mk(r.b2, gx, r.b1 > r.b2 ? "down" : "up", tx, dstDir));
    }
  }
  // Order the runs of a channel top to bottom so that as few verticals as possible cross another run.
  const within = (x: number, run: Run) => x > run.x0 + 0.5 && x < run.x1 - 0.5;
  const crossings = (top: Run, low: Run) => low.up.filter((x) => within(x, top)).length + top.down.filter((x) => within(x, low)).length;
  const slotY = new Map<string, number>();
  for (const [b, list] of runs) {
    for (let pass = 0; pass < list.length; pass++)
      for (let i = 0; i + 1 < list.length; i++)
        if (crossings(list[i + 1], list[i]) < crossings(list[i], list[i + 1])) [list[i], list[i + 1]] = [list[i + 1], list[i]];
    list.forEach((run, i) => slotY.set(`${run.key}|${b}`, boundaryY(b) + spread(i, list.length, 9)));
  }

  return routes.map((r) => {
    const key = `${r.edge.from}>${r.edge.to}`;
    const g = geo.get(key);
    if (!g) {
      const x = portX.get(key + "s")!;
      return { route: r, pts: [[x, cardTop(r.from) + (r.down ? CARD_H : 0)], [portX.get(key + "t")!, cardTop(r.to) + (r.down ? 0 : CARD_H)]] as Pt[] };
    }
    const y1 = slotY.get(`${key}|${r.b1}`)!;
    const pts: Pt[] = [[g.sx, g.sy], [g.sx, y1]];
    let y2 = y1;
    if (g.gx !== null) {
      y2 = slotY.get(`${key}|${r.b2}`)!;
      pts.push([g.gx, y1], [g.gx, y2]);
    }
    pts.push([g.tx, y2], [g.tx, g.ty]);
    return { route: r, pts };
  });
}

const LAID_OUT = buildRoutes();

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Each label sits on a horizontal run of its edge, moved along the run until it
// clears the cards and the labels placed before it.
function placeLabels(): { key: string; x: number; y: number; w: number; text: string }[] {
  const cards: Box[] = STEPS.map((s) => ({ x: cx(s) - CARD_W / 2 - 2, y: cardTop(s) - 2, w: CARD_W + 4, h: CARD_H + 4 }));
  const placed: Box[] = [];
  // A label should not sit on top of another edge's vertical run.
  const crossesOther = (box: Box, self: Route) =>
    LAID_OUT.some(({ route, pts }) => {
      if (route === self) return false;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [a, b] = [pts[i], pts[i + 1]];
        if (a[0] === b[0] && a[0] > box.x - 2 && a[0] < box.x + box.w + 2 && Math.min(a[1], b[1]) < box.y + box.h && Math.max(a[1], b[1]) > box.y) return true;
      }
      return false;
    });
  const out: { key: string; x: number; y: number; w: number; text: string }[] = [];
  for (const { route, pts } of LAID_OUT) {
    const text = route.edge.label;
    if (!text) continue;
    const w = text.length * 6.6 + 12;
    if (pts.length === 2) {
      const mid = (pts[0][1] + pts[1][1]) / 2;
      const box = { x: pts[0][0] + 6, y: mid - 9, w, h: 18 };
      placed.push(box);
      out.push({ key: `${route.edge.from}>${route.edge.to}`, x: box.x + w / 2, y: mid, w, text });
      continue;
    }
    const runs: { x0: number; x1: number; y: number }[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      if (pts[i][1] === pts[i + 1][1]) runs.push({ x0: Math.min(pts[i][0], pts[i + 1][0]), x1: Math.max(pts[i][0], pts[i + 1][0]), y: pts[i][1] });
    }
    runs.sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0));
    let choice: Box | null = null;
    for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      for (const r of runs) {
        if (r.x1 - r.x0 < w + 8) continue;
        const box = { x: r.x0 + (r.x1 - r.x0) * f - w / 2, y: r.y - 9, w, h: 18 };
        if (box.x < r.x0 + 2 || box.x + w > r.x1 - 2) continue;
        if (!cards.some((c) => overlaps(c, box)) && !placed.some((c) => overlaps(c, box)) && !crossesOther(box, route)) {
          choice = box;
          break;
        }
      }
      if (choice) break;
    }
    // Otherwise slide along the longest runs in small steps until the label clears everything.
    for (const r of runs) {
      for (let x = r.x0 + 4; !choice && x + w < r.x1 - 4; x += 6) {
        const box = { x, y: r.y - 9, w, h: 18 };
        if (!cards.some((c) => overlaps(c, box)) && !placed.some((c) => overlaps(c, box)) && !crossesOther(box, route)) choice = box;
      }
      if (choice) break;
    }
    if (!choice) {
      const r = runs[0];
      choice = { x: (r.x0 + r.x1) / 2 - w / 2, y: r.y - 9, w, h: 18 };
    }
    placed.push(choice);
    out.push({ key: `${route.edge.from}>${route.edge.to}`, x: choice.x + w / 2, y: choice.y + 9, w, text });
  }
  return out;
}
const LABELS = placeLabels();
const ROWS = Math.max(...STEPS.map((s) => s.row)) + 1;
const WIDTH = PAD_X * 2 + LANES.length * COL_W;
const HEIGHT = TOP + ROWS * ROW_PITCH + HEAD_H - 20;

function pathD(pts: Pt[]): string {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

function LaneHeads({ y }: { y: number }) {
  return (
    <>
      {LANES.map((l, i) => (
        <g key={l.id} className={`sw-lane-${l.id}`}>
          <text className="sw-head" x={PAD_X + i * COL_W + COL_W / 2} y={y + 20} textAnchor="middle">
            {l.title}
          </text>
        </g>
      ))}
    </>
  );
}

export function Swimlane() {
  return (
    <div className="md-diagram sw-frame">
      <svg className="sw" width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Pipeline swimlane diagram: who does what, and where each step hands off">
        <defs>
          <marker id="sw-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path className="sw-arrowhead" d="M0 1 L10 5 L0 9 z" />
          </marker>
        </defs>
        {LANES.map((l, i) => (
          <rect key={l.id} className={`sw-band${i % 2 ? " alt" : ""}`} x={PAD_X + i * COL_W} y={0} width={COL_W} height={HEIGHT} />
        ))}
        <LaneHeads y={0} />
        <LaneHeads y={HEIGHT - HEAD_H} />
        {LAID_OUT.map(({ route, pts }) => (
          <path key={`${route.edge.from}>${route.edge.to}`} className={`sw-edge${route.edge.dashed ? " dashed" : ""}${route.edge.main ? " main" : ""}`} d={pathD(pts)} markerEnd="url(#sw-arrow)" />
        ))}
        {STEPS.map((s) => {
          const x = cx(s) - CARD_W / 2;
          const y = cardTop(s);
          return (
            <g key={s.id} className={`sw-card sw-lane-${s.lane}`}>
              <rect x={x} y={y} width={CARD_W} height={CARD_H} rx={6} />
              <text className="sw-title" x={x + 10} y={y + 19}>
                {s.lines[0]}
              </text>
              {s.lines.slice(1).map((t, i) => (
                <text key={i} className="sw-detail" x={x + 10} y={y + 35 + i * 15}>
                  {t}
                </text>
              ))}
              {s.approval && (
                <text className="sw-appr" x={x + 10} y={y + CARD_H - 8}>
                  needs {s.approval}
                </text>
              )}
            </g>
          );
        })}
        {LABELS.map((l) => (
          <g key={`l${l.key}`} className="sw-label">
            <rect x={l.x - l.w / 2} y={l.y - 9} width={l.w} height={18} rx={3} />
            <text x={l.x} y={l.y + 4} textAnchor="middle">
              {l.text}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
