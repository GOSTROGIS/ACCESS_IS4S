// The model-step runner: every model call goes through runModelStep (one step) or runTiered (Jev first, Haiku
// where Jev is unsure or unavailable). A step is declared once (src/agents/steps.ts) with its parser, retries,
// lint and fallbacks; the runner does the calls, retries, lint and fix turn (askClaude), the Jev reply parse, the
// usage rows and the error result.
import type { DatabaseSync } from "node:sqlite";
import { queueRoom } from "./call.ts";
import { jevAvailable } from "./jev.ts";
import { jevParallel } from "./accounts.ts";
import { add, askClaude, askJev, pool, saveUsage, type AskOptions, type LintedReply, type Usage } from "../classify/run.ts";
import { CLAUDE_PROMPTS, JEV_PROMPTS, JEV_USD_PER_INPUT_TOKEN, renderJev, type ClaudePromptId, type JevPromptId } from "../prompts/index.ts";
import type { DupePair } from "../dupes/pair.ts";
import type { Item } from "../classify/parse.ts";
import type { Lint, LintProblem } from "../replylint.ts";

/** What a parser knows about the reply it reads. */
export type ParseCtx = {
  /** 0-based attempt number and whether this is the last one the step allows. */
  attempt: number;
  last: boolean;
  /** Claude: what the lint still found after the fix turn (absent without lint); true when a fix turn ran. */
  problems?: LintProblem[];
  fixTurn?: boolean;
  /** Jev: the exit code of `jev ask`. */
  code?: number | null;
};

/** `value` is what the reply answered; `rest` is the part of the input without a valid answer, asked again on the next attempt (absent: done). */
export type Parsed<I, V> = { value: V; rest?: I };

type StepBase<I, V> = {
  /** Items in an input, for the usage row's item count; default: its length for a list, else 1. */
  size?: (input: I) => number;
  /** Attempts per call; default: the prompt's registered `limits.attempts`. */
  attempts?: number;
  /** Wait before each retry, in ms; default 0. */
  backoffMs?: number;
};

export type ClaudeStep<I, V, C = void> = StepBase<I, V> & {
  provider: "claude";
  id: ClaudePromptId;
  /** Default: the prompt's first registered model. */
  model?: string;
  /** The input as `askClaude` takes it (a list of the prompt's inputs); default: the input itself. */
  toPrompt?: (input: I) => unknown[];
  /** Text of the reply; null is a parse error (the call is repeated). */
  parse: (text: string, input: I, ctx: ParseCtx, c: C) => Parsed<I, V> | null;
  /** Lint of the parsed reply, with the fields it covers. Problems after the fix turn go to `parse` in `ctx.problems`; `onFail: "retry"` treats them as a parse error instead. The fix turn itself is the prompt's `lint` registration (src/prompts). */
  lint?: { fields: string[]; make: (input: I, c: C) => Lint; onFail?: "accept" | "retry" };
  /** The value to use when every attempt failed to parse and this returns one for the first reply that did not (a lenient reading of the reply). */
  fallback?: (text: string, input: I, ctx: ParseCtx, c: C) => V | null;
};

export type JevStep<I, V, C = void> = StepBase<I, V> & {
  provider: "jev";
  id: JevPromptId;
  /** The item the run records and the request body (default body: the registered request for the item). */
  request: (input: I, ctx: C) => { item: Item | DupePair | { ref: string }; body?: string };
  /** `answers` of Jev's JSON reply; null is a parse error. Not called when the reply was not JSON. */
  parse: (answers: unknown, input: I, ctx: ParseCtx, c: C) => Parsed<I, V> | null;
};

/** One `token_usage` row for a step call, saved after the last attempt. */
export type UsageSave = {
  run: string;
  agent: string;
  stage: string;
  /** Default: the prompt's first registered model. */
  model?: string;
  /** Items answered; default: the input size minus `rest` (1 for a single input). */
  items?: (answered: boolean, inputSize: number, restSize: number) => number;
  /** Rows of an earlier pass under the same agent name are renamed first, so the replace does not overwrite their cost. */
  keepEarlier?: boolean;
  /** No row when the step got no usage at all (Jev: no reply with a usage field). */
  skipWhen?: (r: { ok: boolean }) => boolean;
  /** Jev: also save the row (with zero tokens) when no reply carried a usage field. */
  withoutUsage?: boolean;
};

export type StepOpts<I, C = void> = Omit<AskOptions, "lint"> & {
  /** Claude: a model other than the prompt's first registered one. */
  model?: string;
  /** Jev: what `request` needs besides the input. */
  ctx?: C;
  usage?: UsageSave;
  cancelled?: () => boolean;
  /** The call itself, in place of the real model call (tests, injected dependencies). Gets the lint the step declares. */
  ask?: (input: I, lint: Lint | undefined) => Promise<LintedReply | null>;
  /** Called before each call with the input still to answer (the first call included). */
  onAttempt?: (input: I, attempt: number) => void;
  /** Called with each Claude reply before it is parsed (log the lint outcome, read `turns`). */
  onReply?: (reply: LintedReply) => void;
};

export type StepResult<I, V> =
  | { ok: true; value: V; values: V[]; rest?: I; usage: Usage; runId: string | undefined }
  | { ok: false; error: string; usage: Usage; runId: string | undefined };

const zero = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: null });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sizeOf = <I,>(step: { size?: (i: I) => number }, x: I) => step.size ? step.size(x) : Array.isArray(x) ? x.length : 1;

type Reply = { text: string; usage: Usage; problems?: LintProblem[]; fixTurn?: boolean } | { answers: unknown; usage: Usage; code: number | null; json: boolean };

/**
 * Runs one declared step on `input`: the call, the parse, up to `attempts` calls (a parse error or a failed call repeats
 * the call; a parser that returns `rest` repeats it for the rest only), the usage row, and the error result.
 * Values of every answered attempt are in `values`, in order; `rest` is what no attempt answered.
 */
export async function runModelStep<I, V, C = void>(db: DatabaseSync, step: ClaudeStep<I, V, C> | JevStep<I, V, C>, input: I, opts: StepOpts<I, C> = {}): Promise<StepResult<I, V>> {
  const reg = step.provider === "jev" ? JEV_PROMPTS[step.id] : CLAUDE_PROMPTS[step.id];
  const attempts = step.attempts ?? reg.limits.attempts;
  const start = new Date().toISOString();
  const values: V[] = [];
  let usage = zero();
  let todo: I | undefined = input, rest: I | undefined = input;
  let fallback: V | null = null, error = "no answer", sawUsage = false;
  for (let attempt = 0; attempt < attempts && todo !== undefined; attempt++) {
    if (opts.cancelled?.()) break;
    if (step.provider === "jev" && !jevAvailable(db)) { error = "jev unavailable"; break; }
    if (attempt > 0 && step.backoffMs) await sleep(step.backoffMs);
    opts.onAttempt?.(todo, attempt);
    const r = await call(db, step, todo, opts);
    if (!r) { error = "no answer"; continue; }
    usage = add(usage, r.usage);
    if ("text" in r) opts.onReply?.(r as LintedReply);
    if ("answers" in r ? r.json : true) sawUsage = true;
    const ctx: ParseCtx = { attempt, last: attempt === attempts - 1, ...("text" in r ? { problems: r.problems, fixTurn: r.fixTurn } : { code: r.code }) };
    if ("answers" in r && !r.json) { error = "unreadable answer"; continue; }
    const reply = ("text" in r ? r.text : r.answers) as never;
    let parsed = (step as { parse: (a: never, i: I, c: ParseCtx, x: C) => Parsed<I, V> | null }).parse(reply, todo, ctx, opts.ctx as C);
    if (parsed && "text" in r && r.problems?.length && (step as ClaudeStep<I, V>).lint?.onFail === "retry") parsed = null;
    if (!parsed) {
      error = "no valid answer";
      fallback ??= (step as { fallback?: (a: never, i: I, c: ParseCtx, x: C) => V | null }).fallback?.(reply, todo, ctx, opts.ctx as C) ?? null;
      continue;
    }
    values.push(parsed.value);
    todo = rest = parsed.rest;
  }
  if (!values.length && fallback !== null) { values.push(fallback); rest = undefined; }
  const ok = values.length > 0;
  if (opts.usage && !(opts.usage.skipWhen?.({ ok }) ?? false) && (sawUsage || opts.usage.withoutUsage)) {
    const u = opts.usage;
    const total = sizeOf(step, input);
    const items = u.items ? u.items(ok, total, rest === undefined ? 0 : sizeOf(step, rest)) : total - (rest === undefined ? 0 : sizeOf(step, rest));
    const model = u.model ?? reg.models[0]!;
    const saved = step.provider === "jev" ? { ...usage, cost: usage.input * JEV_USD_PER_INPUT_TOKEN } : usage;
    if (u.keepEarlier) db.prepare("UPDATE main.token_usage SET agent = agent || '@' || COALESCE(started_at, '') WHERE run_id = ? AND agent = ?").run(u.run, u.agent);
    saveUsage(db, u.run, u.agent, u.stage, model, items, saved, start, new Date().toISOString());
  }
  const runId = opts.usage?.run;
  if (!ok) return { ok: false, error, usage, runId };
  return { ok: true, value: values[values.length - 1]!, values, ...(rest !== undefined && { rest }), usage, runId };
}

async function call<I, V, C>(db: DatabaseSync, step: ClaudeStep<I, V, C> | JevStep<I, V, C>, input: I, opts: StepOpts<I, C>): Promise<Reply | null> {
  if (step.provider === "claude") {
    const lint = step.lint?.make(input, opts.ctx as C);
    const { ctx: _c, usage: _u, cancelled: _x, ask, model: m, onAttempt: _a, onReply: _r, ...ask_ } = opts;
    const model = m ?? step.model ?? CLAUDE_PROMPTS[step.id].models[0]!;
    return ask ? ask(input, lint) : askClaude(step.id, model, (step.toPrompt ? step.toPrompt(input) : input) as never, db, { ...ask_, ...(lint && { lint }) });
  }
  const { item, body } = step.request(input, opts.ctx as C);
  const p = await askJev(step.id, item as never, db, body ?? renderJev(step.id, item as Item | DupePair), opts.usage === undefined);
  type Json = { answers?: unknown; usage?: { input_tokens?: number; output_tokens?: number } };
  let parsed: unknown = null;
  try { parsed = JSON.parse(p.stdout); } catch { /* the step reports an unreadable answer */ }
  const j = parsed !== null && typeof parsed === "object" ? parsed as Json : null;
  const usage: Usage = { input: j?.usage?.input_tokens ?? 0, output: j?.usage?.output_tokens ?? 0, cacheRead: 0, cacheWrite: 0, cost: null };
  return { answers: j?.answers, usage, code: p.code, json: j !== null };
}

/** A Jev step with its Haiku fallback. Jev answers each item; Haiku answers (in batches) the items Jev is not sure about. */
export type TieredStep<It, JV, HV, C = void, B = It[]> = {
  jev: JevStep<It, JV, C>;
  /** Haiku answers a batch; its value is `[ref, answer]` pairs, and `rest` the batch items without one. */
  haiku: ClaudeStep<B, [string, HV][], C>;
  /** The Haiku input for a batch of items (default: the list). */
  batch?: (items: It[], ctx: C) => B;
  ref: (item: It) => string;
  /** Jev's answer settles the item: it is not sent to Haiku. */
  sure: (jev: JV) => boolean;
  /** An item Jev gave no valid answer for goes to Haiku: always, or only when Jev is unavailable (a failure with Jev up leaves the item for the next pass). */
  onJevFailure: "haiku" | "haiku-when-unavailable";
};

export type TieredOpts<It, C> = {
  ctx?: C;
  /** Jev call width (default: the Jev parallelism setting). */
  jevWidth?: number | (() => number);
  jevUsage?: (item: It) => UsageSave;
  /** Haiku batch size; default: the prompt's `perCall`. */
  perCall?: number;
  haikuUsage?: (batch: It[], n: number) => UsageSave;
  /** Start the first Haiku batch alone (a failure that stops all calls then shows early). */
  first?: boolean;
  cancelled?: () => boolean;
};

export type TieredResult<JV, HV> = {
  /** Jev's answer per ref (null: none, or Jev was not asked). */
  jev: Map<string, JV | null>;
  haiku: Map<string, HV>;
  /** Items Jev could not be asked or answer because it is unavailable, so Haiku decided alone. */
  alone: Set<string>;
  /** Items sent to Haiku. */
  asked: Set<string>;
};

export async function runTiered<It, JV, HV, C = void, B = It[]>(db: DatabaseSync, tier: TieredStep<It, JV, HV, C, B>, items: It[], opts: TieredOpts<It, C> = {}): Promise<TieredResult<JV, HV>> {
  const out: TieredResult<JV, HV> = { jev: new Map(), haiku: new Map(), alone: new Set(), asked: new Set() };
  if (jevAvailable(db)) {
    await pool(items.map((x) => async () => {
      if (!jevAvailable(db)) return;
      const r = await runModelStep(db, tier.jev, x, { ctx: opts.ctx, usage: opts.jevUsage?.(x), cancelled: opts.cancelled });
      out.jev.set(tier.ref(x), r.ok ? r.value : null);
    }), opts.jevWidth ?? (() => jevParallel(db)));
  }
  const down = !jevAvailable(db);
  const ask: It[] = [];
  for (const x of items) {
    const jv = out.jev.get(tier.ref(x)) ?? null;
    if (jv !== null && tier.sure(jv)) continue;
    if (jv === null && !down && tier.onJevFailure === "haiku-when-unavailable") continue;
    if (jv === null && down) out.alone.add(tier.ref(x));
    ask.push(x);
  }
  if (!ask.length || opts.cancelled?.()) return out;
  const per = opts.perCall ?? CLAUDE_PROMPTS[tier.haiku.id].limits.perCall;
  const batches: It[][] = [];
  for (let i = 0; i < ask.length; i += per) batches.push(ask.slice(i, i + per));
  await pool(batches.map((batch, n) => async () => {
    for (const x of batch) out.asked.add(tier.ref(x));
    const r = await runModelStep(db, tier.haiku, tier.batch ? tier.batch(batch, opts.ctx as C) : (batch as unknown as B), {
      ctx: opts.ctx, usage: opts.haikuUsage?.(batch, n), cancelled: opts.cancelled });
    if (r.ok) for (const v of r.values) for (const [ref, a] of v) out.haiku.set(ref, a);
  }), () => queueRoom(db), { first: opts.first });
  return out;
}
