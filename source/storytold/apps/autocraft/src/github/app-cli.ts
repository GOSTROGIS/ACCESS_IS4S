// `autocraft github-app register`: prints the dashboard page that registers the
// GitHub App. The page does the work (it posts the manifest from the operator's
// browser and keeps the app's keys in the secrets file), so the keys never pass
// through the terminal.
import { envVar } from "../env.ts";

function registerUrl(): string {
  const base = envVar("BASE_URL")?.replace(/\/+$/, "") ?? `http://${envVar("LISTEN") ?? "127.0.0.1:8993"}`;
  return `${base}/admin/github-app`;
}

export const commands = {
  "github-app": {
    summary: "github-app register: print the page that registers the GitHub App",
    run: (args: string[]) => {
      if (args[0] !== "register") {
        console.error("usage: autocraft github-app register");
        process.exit(1);
      }
      console.log(`Open this page in a browser, signed in as an operator:\n${registerUrl()}`);
    },
  },
};
