// Key handling for the Discord mention store: what is stored about a message is sealed with AES-256-GCM, and
// the lookups used for deletion are keyed hashes, so the database alone reveals no message or author id.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

/** `author` is a keyed hash of the author id, kept only to answer a deletion request by user id. */
export type MessageRef = { guildId: string; channelId: string; messageId: string; at: string; author?: string };

export class DiscordKeys {
  #enc: Buffer;
  #mac: Buffer;
  constructor(secret: string) {
    this.#enc = Buffer.from(hkdfSync("sha256", secret, "autocraft-discord", "mention-seal", 32));
    this.#mac = Buffer.from(hkdfSync("sha256", secret, "autocraft-discord", "mention-hash", 32));
  }
  /** Keyed hash for finding a row again without storing the id. `kind` keeps message and author hashes apart. */
  hash(kind: "message" | "author" | "channel", id: string): string {
    return createHmac("sha256", this.#mac).update(`${kind}:${id}`).digest("base64url");
  }
  /** Signature for short-lived signed values (link tokens); `purpose` keeps the uses apart. */
  sign(purpose: string, data: string): string {
    return createHmac("sha256", this.#mac).update(`sign:${purpose}:${data}`).digest("base64url");
  }
  seal(ref: MessageRef, aad: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.#enc, iv);
    c.setAAD(Buffer.from(aad));
    const body = Buffer.concat([c.update(JSON.stringify(ref), "utf8"), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
  }
  open(sealed: string, aad: string): MessageRef | null {
    try {
      const buf = Buffer.from(sealed, "base64url");
      const d = createDecipheriv("aes-256-gcm", this.#enc, buf.subarray(0, 12), { authTagLength: 16 });
      d.setAAD(Buffer.from(aad));
      d.setAuthTag(buf.subarray(12, 28));
      const v = JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8")) as MessageRef;
      return typeof v.messageId === "string" ? v : null;
    } catch {
      return null;
    }
  }
}

export class DiscordConfigError extends Error {}

/** The bot token from the file named by AUTOCRAFT_DISCORD_TOKEN_FILE. Never logged, never stored. */
export function readTokenFile(path: string): string {
  const text = readSecretFile(path, "token file");
  if (!text) throw new DiscordConfigError("Discord token file is empty");
  return text;
}

export function readKeyFile(path: string): DiscordKeys {
  const text = readSecretFile(path, "key file");
  if (text.length < 32) throw new DiscordConfigError("Discord key file must hold at least 32 characters of random text");
  return new DiscordKeys(text);
}

function readSecretFile(path: string, what: string): string {
  let mode: number;
  try {
    mode = statSync(path).mode;
  } catch {
    throw new DiscordConfigError(`Discord ${what} not found`);
  }
  if (mode & 0o077) throw new DiscordConfigError(`Discord ${what} is readable or writable by group or others; chmod 600 it`);
  return readFileSync(path, "utf8").trim();
}
