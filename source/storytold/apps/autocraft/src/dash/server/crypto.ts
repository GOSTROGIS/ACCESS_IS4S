import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export const sha256hex = (s: string): string => createHash("sha256").update(s).digest("hex");

export const pkceChallenge = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// AES-256-GCM with a key derived from the session key. The AAD binds a
// ciphertext to one session row, so a token can't be moved to another session.
// Values sealed under the earlier HKDF label are re-sealed once at startup (reseal.ts); `open` reads only the current key.
const LABEL = "autocraft";
const LEGACY_LABEL = "craft-automation";
const deriveKey = (sessionKey: string, label: string): Buffer => Buffer.from(hkdfSync("sha256", sessionKey, label, "github-token", 32));

export class TokenBox {
  #key: Buffer;
  #legacyKey: Buffer;
  constructor(sessionKey: string) {
    this.#key = deriveKey(sessionKey, LABEL);
    this.#legacyKey = deriveKey(sessionKey, LEGACY_LABEL);
  }
  seal(plain: string, aad: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.#key, iv);
    c.setAAD(Buffer.from(aad));
    const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
  }
  open(sealed: string, aad: string): string | null {
    return this.#openWith(this.#key, sealed, aad);
  }
  /** The value sealed under the current key when only the earlier key opens `sealed`; null when it is already current or unreadable. For the startup migration only. */
  resealLegacy(sealed: string, aad: string): string | null {
    if (this.#openWith(this.#key, sealed, aad) !== null) return null;
    const plain = this.#openWith(this.#legacyKey, sealed, aad);
    return plain === null ? null : this.seal(plain, aad);
  }
  #openWith(key: Buffer, sealed: string, aad: string): string | null {
    try {
      const buf = Buffer.from(sealed, "base64url");
      const d = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12), { authTagLength: 16 });
      d.setAAD(Buffer.from(aad));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
    } catch {
      return null;
    }
  }
}
