import { homedir } from "node:os";

// Replaces anything that looks like a credential. Logs hold step output only,
// but a tool's error message could still quote a header or an environment value.

// Credentials with a fixed shape: provider prefixes, AWS key ids, JWTs, PEM private keys. A match is a credential
// wherever it appears, in prose or in code.
const FIXED_SHAPES: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
];
// `sk-` and `xox?-` also start ordinary names (CSS classes, slugs): only a run with letters and digits counts.
const fixedMatch = (m: string): boolean => !/^(?:sk-|xox)/.test(m) || (/[0-9]/.test(m) && /[A-Za-z]/.test(m.slice(3)));
// An auth scheme and its credential.
const AUTH_HEADER = /\b(Bearer|token|Basic)(\s+)([A-Za-z0-9._~+/=-]{16,})/gi;
// A value under a credential-like name. The value stops at quotes, backticks and punctuation, which are never consumed.
const NAMED = /\b([A-Za-z_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|SESSION_KEY|CLIENT_SECRET)[A-Za-z_]*)(\s*[:=]\s*)(["']?)([^\s"'`,;)\]}]+)/gi;
// Long mixed-case letter-and-digit runs (keys) that aren't hex digests or commit ids.
const LONG_RANDOM = /\b[A-Za-z0-9_+/-]{40,}={0,2}/g;
// Credentials in a URL: scheme://user:password@host.
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@:`'"]+:[^\s/?#@`'"]+@/gi;
// A hex value given under a key-like name, also quoted as in JSON (worker keys, webhook and session secrets).
const NAMED_HEX = /\b([A-Za-z_-]*(?:secret|token|passw|hmac|cookie|credential|authorization|(?:api|access|private|signing|session|worker|client)[_-]?key)[A-Za-z_-]*["']?\s*[:=]\s*["']?)[0-9a-f]{16,}\b/gi;
// Three dot-separated base64url parts: JWTs and other signed tokens (a Discord bot token has a short middle part).
const DOTTED = /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{16,}\b/g;
const HEX_RUN = /\b[0-9a-f]{32,}\b/gi;
const B64_RUN = /[A-Za-z0-9+/_-]{20,}={0,2}/g;
// Hex lengths of md5, sha1 (commit ids), sha224, sha256, sha384 and sha512 digests: any other long hex run is taken for a key.
const DIGEST_LENGTHS = new Set([32, 40, 56, 64, 96, 128]);
const mixed = (m: string) => /[A-Z]/.test(m) && /[a-z]/.test(m) && /[0-9]/.test(m);
const matches = (re: RegExp, text: string) => { re.lastIndex = 0; return re.test(text); };

/**
 * Whether a value looks generated rather than written: 16 or more characters, letters and digits that alternate
 * several times. Numbers, identifiers (`max_tokens`, `ContributorsViews2`) and expressions are not.
 */
function looksRandom(v: string): boolean {
  if (v.length < 16 || !/[0-9]/.test(v) || !/[A-Za-z]/.test(v)) return false;
  return (v.match(/[A-Za-z][0-9]|[0-9][A-Za-z]/g) ?? []).length >= 3;
}

// A run that is part of a URL or a path: it has a slash, is followed by a file extension, or sits in a URL.
function pathLike(text: string, at: number, run: string): boolean {
  if (run.includes("/") || /^\.[A-Za-z0-9]{1,10}\b/.test(text.slice(at + run.length))) return true;
  const start = Math.max(text.lastIndexOf(" ", at), text.lastIndexOf("\n", at), text.lastIndexOf("\t", at)) + 1;
  return /^[`'"(<\[]*[a-z][a-z0-9+.-]*:\/\//i.test(text.slice(start, at));
}

/** Whether `text` holds a credential of a fixed shape (provider token, AWS key id, JWT, PEM private key). */
export function hasFixedCredential(text: string): boolean {
  return FIXED_SHAPES.some((p) => {
    p.lastIndex = 0;
    for (let m = p.exec(text); m; m = p.exec(text)) if (fixedMatch(m[0])) return true;
    return false;
  });
}

// A known credential shape inside a hex or base64 encoding (a Basic header value without its label, an encoded environment).
function decodesToSecret(m: string, encoding: "hex" | "base64"): boolean {
  if (encoding === "hex" && m.length % 2) return false;
  const d = Buffer.from(encoding === "hex" ? m : m.replace(/-/g, "+").replace(/_/g, "/"), encoding).toString("latin1");
  return /^[\x20-\x7e\t\n\r]+$/.test(d) && (hasFixedCredential(d) || matches(URL_USERINFO, d) || matches(AUTH_HEADER, d));
}

/** Hides anything that looks like a credential: for logs, stored copies and text that is shown or posted. Quotes, backticks, URLs and paths stay readable. */
export function scrub(text: string): string {
  // Paths under the home directory show as ~/...: the log is shown to everyone signed in.
  let t = text.replaceAll(homedir(), "~");
  // Encoded credentials first, while the encoded run is still whole.
  t = t.replace(B64_RUN, (m) => (/^[0-9a-f]+$/i.test(m) || !decodesToSecret(m, "base64") ? m : "[hidden]"));
  t = t.replace(HEX_RUN, (m) => (/^[0-9]+$/.test(m) || (DIGEST_LENGTHS.has(m.length) && !decodesToSecret(m, "hex")) ? m : "[hidden]"));
  t = t.replace(URL_USERINFO, "$1[hidden]@");
  t = t.replace(NAMED_HEX, "$1[hidden]");
  for (const p of FIXED_SHAPES) t = t.replace(p, (m) => (fixedMatch(m) ? "[hidden]" : m));
  t = t.replace(AUTH_HEADER, (m, scheme: string, sp: string, v: string) => (looksRandom(v) ? `${scheme}${sp}[hidden]` : m));
  t = t.replace(NAMED, (m, name: string, sep: string, q: string, v: string) => (looksRandom(v) ? `${name}${sep}${q}[hidden]` : m));
  t = t.replace(DOTTED, (m) => (mixed(m) ? "[hidden]" : m));
  return t.replace(LONG_RANDOM, (m, at: number, all: string) => (/^[0-9a-f]+$/i.test(m) || !mixed(m) || pathLike(all, at, m) ? m : "[hidden]"));
}
