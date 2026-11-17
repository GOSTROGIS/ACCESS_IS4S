// Signing an account in from the dashboard. `claude auth login --claudeai` runs
// hidden in a pseudo-terminal (util-linux `script`, since the CLI wants a tty),
// prints a sign-in URL, and waits for the code the operator gets from that page.
// `claude setup-token` goes through the same steps and then draws a long-lived
// token with its TUI. Cursor positioning makes the raw byte stream an unreliable
// source (stripping the codes glues unrelated screen text onto the token), so that
// output also feeds a headless terminal emulator (xterm, 1000 x 50 like the pty)
// that draws everything after the code was typed, and the token is read from its
// rendered screen. A token at the end of a screen line may be half drawn, so the
// screen is read only once the stripped stream shows a complete token or the
// process has closed, and a blank cell follows it on its row. The URL and the failure patterns read the stripped stream.
// The token goes to `onToken`, which checks and stores it (true: saved, false: the
// check failed) while the state stays "checking".
// The code and the token are secrets: never logged, stored (the token only by
// `onToken`) or echoed, and none of the command's output leaves this process
// except the URL and, when a token request fails, its rendered screen text after
// the code with every token and the code cut out (`setup-token-failed.log` in the
// account's config directory, mode 0600), so the failure can be read.
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type xterm from "@xterm/headless";
import { claudeBin } from "./box.ts";
import { childEnv } from "./status.ts";
import { extractScreenToken, extractToken } from "./token.ts";

export type LoginState = "starting" | "waiting" | "checking" | "done" | "failed" | "cancelled";
/** "login": the regular sign-in; "token": a long-lived token from `claude setup-token`. */
export type LoginKind = "login" | "token";
export type LoginInfo = { state: LoginState; url: string | null; message: string | null; kind: LoginKind };

export const LOGIN_CODE = /^[A-Za-z0-9#_.~+/=-]{1,512}$/;
const LOGIN_URL = /https:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]+/;
const LOGIN_OK = /login successful|successfully logged in|logged in as/i;
const LOGIN_FAILED = /error|failed|invalid|expired|denied/i;
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Za-z0-9]|[\x00-\x08\x0b-\x1f\x7f]/g;

export const timing = { urlMs: 30_000, codeMs: 60_000, enterMs: 300, maxMs: 10 * 60_000 };

/** Checks and stores a token: true when it was saved, false when the check failed; a throw means it could not be saved. */
export type TokenSink = (token: string, signal: AbortSignal) => Promise<boolean>;
type Terminal = InstanceType<typeof xterm.Terminal>;
type Live = { kind: LoginKind; configDir: string; onToken?: TokenSink; child: ChildProcess; info: LoginInfo; out: string; code?: string; term?: Terminal; screen: string; busy?: boolean; abort: AbortController; codeTimer?: NodeJS.Timeout; timers: NodeJS.Timeout[]; onDone?: () => void };
const live = new Map<string, Live>();
const last = new Map<string, LoginInfo>();

const shq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;
// The terminal echoes the typed code; it is cut out before any pattern looks at the output.
const fresh = (l: Live) => (l.code ? l.out.replaceAll(l.code, "") : l.out);
const clean = (s: string) => s.replace(ANSI, "");
/** "the code was not accepted", with the CLI's own line that said so; anything token-like is masked. */
const notAccepted = (text: string): string => {
  const line = text.split(/\r?\n/).map((x) => x.trim()).find((x) => LOGIN_FAILED.test(x));
  const why = line?.replace(/sk-ant-[\w-]+/g, "…").replace(/[A-Za-z0-9_\-+/=]{24,}/g, "…").slice(0, 160);
  return why ? `the code was not accepted: ${why}` : "the code was not accepted";
};
const cutCode = (l: Live, s: string) => (l.code ? s.replaceAll(l.code, "") : s);

/** The text on the emulated screen (and its scrollback): wrapped lines joined, others split by a newline. */
function renderScreen(term: Terminal): string {
  // Cells are not trimmed: a blank cell after the token proves the row holds no more of it.
  const buf = term.buffer.active;
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (!line) continue;
    out += (i > 0 && line.isWrapped ? "" : i > 0 ? "\n" : "") + line.translateToString(false);
  }
  return out;
}

const ANY_TOKEN = /sk-ant-[A-Za-z0-9_-]+/g;
const LONG_RUN = /[A-Za-z0-9_-]{40,}/g;

function keepFailedScreen(l: Live): void {
  try {
    writeFileSync(join(l.configDir, "setup-token-failed.log"), `${new Date().toISOString()} stream token: ${extractToken(fresh(l), true) ? "yes" : "no"}, screen token: ${extractScreenToken(cutCode(l, l.screen), true) ? "yes" : "no"}\n${cutCode(l, l.screen).replace(/ +$/gm, "").replace(ANY_TOKEN, (m) => `${m.match(/^sk-ant-[a-z0-9]+-/)?.[0] ?? "sk-ant-"}[token]`).replace(LONG_RUN, "[token]").slice(-4000)}\n`, { mode: 0o600 });
  } catch {
    // Diagnostics only.
  }
}

function finish(id: string, l: Live, state: LoginState, message: string | null): void {
  if (live.get(id) !== l) return;
  for (const t of l.timers) clearTimeout(t);
  l.abort.abort();
  if (l.kind === "token" && state === "failed" && l.info.state === "checking") keepFailedScreen(l);
  l.code = undefined;
  l.out = "";
  l.screen = "";
  l.term?.dispose();
  l.term = undefined;
  l.info = { state, url: null, message, kind: l.kind };
  last.set(id, l.info);
  live.delete(id);
  l.child.kill("SIGKILL");
  l.onDone?.();
}

/** The login of one account: the running one, or the last one's outcome. */
export function loginInfo(id: string): LoginInfo | null {
  return live.get(id)?.info ?? last.get(id) ?? null;
}

export function loginRunning(id: string): boolean {
  return live.has(id);
}

/**
 * Takes the token off the rendered screen once the stream shows it complete (or the process has closed) and
 * hands it to `onToken`; true when the flow has ended with it.
 */
async function takeToken(id: string, l: Live, final: boolean): Promise<boolean> {
  // While the CLI runs, the stream must show the token before the screen is read (the screen may not be drawn yet). Once it
  // has exited the screen is complete, and the stream may hold the token only in pieces (the CLI draws lines with cursor moves).
  if (l.kind !== "token" || !l.term || (!final && !extractToken(fresh(l), false))) return false;
  const t = extractScreenToken(cutCode(l, l.screen), final);
  if (!t) return false;
  l.busy = true;
  l.out = "";
  clearTimeout(l.codeTimer);
  try {
    if (!l.onToken) throw new Error("no sink");
    const saved = await l.onToken(t, l.abort.signal);
    if (saved === true) finish(id, l, "done", "token saved");
    else finish(id, l, "failed", "the token could not be checked");
  } catch {
    finish(id, l, "failed", "the token could not be saved");
  }
  return true;
}

/**
 * Starts a login (or, with kind "token", a long-lived token request) or returns the one running, and resolves
 * once its URL is known or it failed. `onDone` runs when it ends, however it ends; `onToken` gets the token.
 */
export async function startLogin(id: string, configDir: string, onDone?: () => void, kind: LoginKind = "login", onToken?: TokenSink): Promise<LoginInfo> {
  const running = live.get(id);
  if (running) return running.info;
  // A wide terminal keeps the URL on one line. exec: killing the pty's shell kills the CLI.
  const cmd = `stty cols 1000 rows 50 2>/dev/null; exec ${shq(claudeBin())} ${kind === "token" ? "setup-token" : "auth login --claudeai"}`;
  const child = spawn("script", ["-q", "-f", "-e", "-c", cmd, "/dev/null"], { env: childEnv(configDir, { BROWSER: "true" }), stdio: ["pipe", "pipe", "ignore"] });
  const l: Live = { kind, configDir, onToken, child, info: { state: "starting", url: null, message: null, kind }, out: "", screen: "", abort: new AbortController(), timers: [], onDone };
  // Loaded here, not at the top: the build worker runs this code from a git archive without node_modules, and the CLI loads every module.
  if (kind === "token") l.term = new (await import("@xterm/headless")).default.Terminal({ cols: 1000, rows: 50, scrollback: 200, allowProposedApi: true });
  live.set(id, l);
  last.delete(id);
  l.timers.push(setTimeout(() => finish(id, l, "failed", "the sign-in timed out"), timing.maxMs));
  child.stdin!.on("error", () => {});
  child.stdout!.on("data", (b: Buffer) => {
    if (live.get(id) !== l) return;
    const chunk = b.toString("utf8");
    // Patterns look at the whole buffer with this chunk; the cap applies after, so a large chunk can't cut off the URL or the token first.
    const handle = async () => {
      try {
        await onData();
      } finally {
        if (live.get(id) === l) l.out = l.out.slice(-20_000);
      }
    };
    // The emulator parses asynchronously: the screen is read once this chunk is drawn.
    // Once the emulator is in use, the stream text joins the buffer only when the chunk is drawn, so the token gate never sees bytes the screen lacks.
    if (l.term && l.info.state === "checking") {
      l.term.write(chunk, () => {
        if (live.get(id) !== l) return;
        l.out += clean(chunk);
        void render(l).then(handle);
      });
    } else {
      l.out += clean(chunk);
      l.term?.write(chunk);
      void handle();
    }
  });
  const render = async (x: Live) => {
    if (x.term && x.info.state === "checking") x.screen = renderScreen(x.term);
  };
  const onData = async () => {
    if (l.busy) return;
    if (l.info.state === "starting") {
      const m = l.out.match(LOGIN_URL);
      if (m) l.info = { state: "waiting", url: m[0].replace(/[.,;:!?)\]]+$/, ""), message: null, kind };
    } else if (l.info.state === "checking") {
      if (await takeToken(id, l, false)) return;
      if (live.get(id) !== l) return;
      const f = fresh(l);
      if (kind === "token") {
        if (LOGIN_FAILED.test(f)) finish(id, l, "failed", notAccepted(f));
      } else if (LOGIN_OK.test(f)) finish(id, l, "done", "signed in");
      else if (LOGIN_FAILED.test(f)) finish(id, l, "failed", notAccepted(f));
    }
  };
  child.on("error", () => finish(id, l, "failed", "the claude command could not be started"));
  child.on("close", (code) => void onClose(code));
  const onClose = async (code: number | null) => {
    if (live.get(id) !== l || l.busy) return;
    if (l.term) await new Promise<void>((r) => l.term!.write("", r));
    if (live.get(id) !== l || l.busy) return;
    await render(l);
    if (l.info.state === "checking" && (await takeToken(id, l, true))) return;
    if (live.get(id) !== l) return;
    if (l.info.state === "checking" && kind === "login" && (code === 0 || LOGIN_OK.test(fresh(l)))) finish(id, l, "done", "signed in");
    else finish(id, l, "failed", l.info.state === "checking" ? notAccepted(fresh(l)) : "the sign-in ended without a result");
  };
  const until = Date.now() + timing.urlMs;
  while (live.get(id) === l && l.info.state === "starting" && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
  if (live.get(id) === l && l.info.state === "starting") finish(id, l, "failed", "the login command printed no sign-in URL");
  return loginInfo(id)!;
}

/** Sends the pasted code to the waiting login. Returns false when no login waits for one. */
export function submitCode(id: string, code: string): boolean {
  const l = live.get(id);
  if (!l || l.info.state !== "waiting" || !LOGIN_CODE.test(code)) return false;
  // Only output after the code counts; a fresh buffer keeps that true once the capped buffer is full.
  l.out = "";
  l.code = code;
  l.info = { state: "checking", url: null, message: null, kind: l.kind };
  l.codeTimer = setTimeout(() => finish(id, l, "failed", "no answer to the code"), timing.codeMs);
  l.timers.push(l.codeTimer);
  // Enter goes separately: the CLI reads one write as a paste, and an Enter inside a paste doesn't submit.
  l.child.stdin!.write(code);
  l.timers.push(setTimeout(() => l.child.stdin!.write("\r"), timing.enterMs));
  return true;
}

export function cancelLogin(id: string): boolean {
  const l = live.get(id);
  if (!l) return false;
  finish(id, l, "cancelled", null);
  return true;
}
