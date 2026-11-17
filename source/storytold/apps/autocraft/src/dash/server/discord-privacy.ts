// The public privacy notice of the optional Discord bot. No sign-in; the only stored value it shows is the operators' contact text.
import { esc, plainPage } from "./util.ts";

// Discord refuses app URLs that contain its name.
export const DISCORD_PRIVACY_PATH = "/privacy";

export function discordPrivacyPage(nonce: string, contact: string): string {
  const who = contact.trim() ? esc(contact.trim()) : "the operators of this AutoCraft instance";
  return plainPage(nonce, "Discord bot privacy", `<style nonce="${nonce}">main{max-width:38rem}h2{font-size:15px;margin:18px 0 4px}</style>
<h2>What the bot collects</h2>
<p>Messages in the channels its operators choose, the commands you send it, and, if you link your account, your Discord user ID and GitHub login. A linked account that turns on alerts gets direct messages about decisions, and the IDs of those messages are kept to update them.</p>
<h2>How it is used</h2>
<p>To count references to GitHub issues and pull requests, to answer searches and commands, and to recognise linked accounts.</p>
<h2>What is kept</h2>
<p>References to GitHub issues and pull requests with the IDs of the messages that made them, and account links. Message text is not kept.</p>
<h2>Sharing</h2>
<p>Search text, issue drafts and messages that mention an issue or pull request (to check whether they ask for attention) may be processed by an AI service provider. They are not stored or sold.</p>
<h2>Deletion</h2>
<p>Deleting a message removes its record. Unlink your account with <code>/autocraft unlink</code>. For other requests, contact ${who}.</p>`);
}
