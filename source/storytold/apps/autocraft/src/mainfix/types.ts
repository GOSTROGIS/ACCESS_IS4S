// Shared by the mainfix.classify prompt (src/prompts, which imports no Node modules) and the main-fix step.

/** One failed step of a failed check: the tail of its log. The log is untrusted text from CI. */
export type MainFixStep = { job: string; step: string; log: string };
/** What the prompt shows for the failed checks of one default-branch head. Every string field is untrusted. */
export type MainFixInput = {
  ref: string;
  checks: { check: string; conclusion: string; steps: MainFixStep[] }[];
};

export const VERDICTS = ["flaky", "infra", "code"] as const;
export type MainFixVerdict = (typeof VERDICTS)[number];

export const REASON_WORDS = 25;

export const SAMPLE_MAIN_FIX: MainFixInput[] = [{
  ref: "photocraft@9f3c1a77",
  checks: [
    { check: "gate / test", conclusion: "failure", steps: [{ job: "test", step: "cargo test", log: "error: failed to download from `https://index.crates.io/ph/ot/photocraft-codecs` while building the 16-bit PNG codec\nCaused by: [28] Timeout was reached (Operation timed out after 30000 milliseconds)\n" }] },
    { check: "gate / publish-preview", conclusion: "failure", steps: [{ job: "publish-preview", step: "Upload preview", log: "HTTP 403: Resource not accessible by integration\nError: Process completed with exit code 1.\n" }] },
  ],
}];
