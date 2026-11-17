// The two public routes of a Discord reporter's GitHub sign-in (src/discord/reporter.ts): /discord/github/start sends the
// browser to GitHub's authorization page, /discord/github/callback stores the token. No dashboard session is involved and
// none is created: the token only lets the bot file an issue as that account. The state, bound to the Discord user, is
// single use and expires after ten minutes; a cookie set at the start binds the callback to the same browser, so a
// link cannot be used to sign someone else's GitHub account in for a stranger's Discord user.
import type { DatabaseSync } from "node:sqlite";
import { peekReporterState, saveReporter, takeReporterState } from "../../discord/reporter.ts";
import type { Res } from "../types.ts";
import { pkceChallenge, safeEqual, type TokenBox } from "./crypto.ts";
import type { Provider } from "./provider.ts";
import { esc, plainPage } from "./util.ts";

export const REPORTER_START_PATH = "/discord/github/start";
export const REPORTER_CALLBACK_PATH = "/discord/github/callback";
const COOKIE = "__Host-craft_reporter";

const page = (nonce: string, status: number, title: string, text: string): Res => ({ status, html: plainPage(nonce, title, `<p>${esc(text)}</p>`) });
const setCookie = (value: string, maxAge: number): string => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export type ReporterSignIn = { db: DatabaseSync; box: TokenBox; provider: Provider | null; baseUrl: string | null };

/** Null when the path is not one of the two routes. */
export async function reporterSignIn(d: ReporterSignIn, url: URL, cookies: Map<string, string>, nonce: string): Promise<{ r: Res; cookies?: string[] } | null> {
  const redirectUri = `${d.baseUrl ?? ""}${REPORTER_CALLBACK_PATH}`;
  if (url.pathname === REPORTER_START_PATH) {
    const state = url.searchParams.get("state") ?? "";
    const s = state ? peekReporterState(d.db, state) : null;
    if (!s) return { r: page(nonce, 400, "Sign-in expired", "Go back to Discord and press File it again to get a new link.") };
    if (!d.provider) return { r: page(nonce, 503, "Sign-in unavailable", "Filing from Discord is not set up.") };
    return { r: { redirect: d.provider.authorizeUrl(state, pkceChallenge(s.verifier), redirectUri) }, cookies: [setCookie(state, 600)] };
  }
  if (url.pathname !== REPORTER_CALLBACK_PATH) return null;
  const clear = [setCookie("", 0)];
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (url.searchParams.get("error")) return { r: page(nonce, 400, "Sign-in cancelled", "GitHub sign-in did not complete."), cookies: clear };
  const s = state && code && safeEqual(cookies.get(COOKIE) ?? "", state) ? takeReporterState(d.db, state) : null;
  if (!s) return { r: page(nonce, 400, "Sign-in expired", "Go back to Discord and press File it again to get a new link."), cookies: clear };
  if (!d.provider) return { r: page(nonce, 503, "Sign-in unavailable", "Filing from Discord is not set up."), cookies: clear };
  try {
    const tokens = await d.provider.exchange(code, s.verifier, redirectUri);
    const who = tokens ? await d.provider.identity(tokens.access) : null;
    if (!tokens || !who) return { r: page(nonce, 400, "Sign-in failed", "GitHub did not accept the sign-in. Go back to Discord and try again."), cookies: clear };
    saveReporter(d.db, d.box, s.reporter, who.id, who.login, tokens);
    return { r: { html: plainPage(nonce, "Signed in", `<p>Signed in as ${esc(who.login)}. Go back to Discord and press File it.</p>`) }, cookies: clear };
  } catch (e) {
    console.error(`reporter sign-in: ${(e as Error).message}`);
    return { r: page(nonce, 502, "Sign-in failed", "GitHub did not answer. Try again in a minute."), cookies: clear };
  }
}
