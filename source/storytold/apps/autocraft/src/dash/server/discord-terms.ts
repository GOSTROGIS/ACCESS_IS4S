// The public terms of use of the optional Discord bot. No sign-in, no data from the database but the operators' contact text.
import { esc, plainPage } from "./util.ts";

export const DISCORD_TERMS_PATH = "/terms";

export function discordTermsPage(nonce: string, contact: string): string {
  const who = contact.trim() ? esc(contact.trim()) : "the operators of this AutoCraft instance";
  return plainPage(nonce, "Discord bot terms of use", `<style nonce="${nonce}">main{max-width:38rem}</style>
<p>By using this bot you agree to Discord&rsquo;s terms and these terms.</p>
<p>Don&rsquo;t misuse the bot or try to get around its limits.</p>
<p>The bot is provided as is, without warranty. Its answers may be wrong.</p>
<p>The operators may change or stop the bot, or these terms, at any time.</p>
<p>See the <a href="/privacy">privacy notice</a>. Questions: ${who}.</p>`);
}
