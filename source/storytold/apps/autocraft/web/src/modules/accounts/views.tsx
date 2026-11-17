// Claude accounts: sign-in state, login end date and plan use for everyone;
// operators add accounts, sign them in with a code, sign out, enable and refresh.
import { useState } from "react";
import { KeyIcon, LockKeyIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { Dialog } from "radix-ui";
import { useApi, useQuery } from "../../api/client";
import type { ClaudeAccount } from "../../api/types";
import { eventTime } from "../../lib/format";
import { useUser } from "../../shell/UserContext";
import { Badge } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { cn } from "../../ui/cn";
import { EditForm, JevLine, PauseLevels, UsageBar } from "./controls";
import { Block, ConfirmButton, ErrorLine, Page, TextInput, useWrite, when } from "../admin/parts";
import { useNow } from "../../lib/useNow";
import { safeHref } from "../../ui/safeHref";

const useList = () => useQuery<ClaudeAccount[]>("accounts-page", (a) => a.accounts.list());

function LoginDialog({ a, kind, onClose }: { a: ClaudeAccount; kind: "login" | "token"; onClose: () => void }) {
  const api = useApi();
  const write = useWrite();
  const [code, setCode] = useState("");
  // The sign-in runs in the dashboard process and its progress is not stored, so no change event reports it: poll until it ends.
  const q = useQuery<ClaudeAccount[]>("accounts-login", (x) => x.accounts.list(), {
    pollMs: (d) => {
      const s = (d?.find((x) => x.id === a.id)?.login ?? a.login)?.state;
      return s === "done" || s === "failed" || s === "cancelled" ? false : 2000;
    },
  });
  const login = q.data?.find((x) => x.id === a.id)?.login ?? a.login;
  const state = login?.state ?? "starting";
  const token = kind === "token";
  const status = { starting: "Starting…", waiting: "Waiting for the code", checking: "Checking the code…", done: token ? "Token saved" : "Signed in", failed: login?.message ?? "Sign-in failed", cancelled: "Cancelled" }[state];
  const ended = state === "done" || state === "failed" || state === "cancelled";
  const close = () => {
    if (!ended) void (token ? api.accounts.tokenCancel(a.id) : api.accounts.loginCancel(a.id)).catch(() => {});
    onClose();
  };
  return (
    <Dialog.Root open onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-panel p-4" aria-describedby={undefined}>
          <Dialog.Title className="text-sm font-semibold">{token ? `Long-lived token for ${a.label}` : `Sign in ${a.label}`}</Dialog.Title>
          <div className="mt-3 space-y-3">
            {login?.url && !ended && (
              <a href={safeHref(login.url)} target="_blank" rel="noreferrer noopener" className="block text-sm text-accent underline">
                {token ? "Open token page" : "Open sign-in page"}
              </a>
            )}
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void write.run("code", () => (token ? api.accounts.tokenCode(a.id, code.trim()) : api.accounts.loginCode(a.id, code.trim()))).then((ok) => ok && (setCode(""), q.refetch()));
              }}
            >
              <label className="flex grow flex-col gap-1 text-xs text-ink/60">
                Code
                <TextInput value={code} autoComplete="off" spellCheck={false} onChange={(e) => setCode(e.target.value)} disabled={state !== "waiting"} className="text-ink" />
              </label>
              <Button type="submit" variant="primary" size="sm" disabled={state !== "waiting" || !code.trim()} loading={write.busy === "code"} className="max-md:h-11">
                Submit
              </Button>
            </form>
            <p className={cn("text-sm", state === "failed" ? "text-bad" : state === "done" ? "text-ok" : "text-ink/70")} role="status">
              {status}
            </p>
            <ErrorLine error={write.error} />
          </div>
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="ghost" onClick={close} className="max-md:h-11">
              {ended ? "Close" : "Cancel"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ a, operator, onChanged }: { a: ClaudeAccount; operator: boolean; onChanged: () => void }) {
  useNow();
  const api = useApi();
  const write = useWrite();
  const [signing, setSigning] = useState<"login" | "token" | null>(null);
  const [editing, setEditing] = useState(false);
  const act = (key: string, f: () => Promise<unknown>) => void write.run(key, f).then((ok) => ok && onChanged());
  const exp = a.auth.expiresAt ? Date.parse(a.auth.expiresAt) : null;
  return (
    <li className={cn("min-w-0 rounded-md border border-line p-4", !a.enabled && "bg-ink/[0.02]")}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{a.label}</h3>
        <Badge tone={a.enabled ? "ok" : "neutral"}>{a.enabled ? "Enabled" : "Disabled"}</Badge>
        <Badge tone={a.auth.loggedIn ? "ok" : a.auth.loggedIn === false ? "warn" : "neutral"}>{a.auth.loggedIn ? "Signed in" : a.auth.loggedIn === false ? "Signed out" : "Not checked"}</Badge>
        {a.auth.plan && <Badge>{a.auth.plan}</Badge>}
        {a.pausedReason && a.enabled && <Badge tone="warn">Paused</Badge>}
        {operator && (
          <button onClick={() => setEditing(!editing)} aria-label={`Edit ${a.label}`} className="ml-auto flex size-7 items-center justify-center text-ink/50 hover:bg-ink/[0.06] hover:text-ink max-md:size-11">
            <PencilSimpleIcon className="text-[14px]" />
          </button>
        )}
      </div>
      <div className="mt-3 space-y-3">
        <UsageBar label="5-hour use" pct={a.usage.fiveHourPct} resetsAt={a.usage.fiveHourResetsAt} />
        <UsageBar label="Weekly use" pct={a.usage.weeklyPct} resetsAt={a.usage.weeklyResetsAt} />
      </div>
      <dl className="num mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
        <dt className="text-ink/55">Running</dt>
        <dd>
          {a.running} of {a.maxConcurrent} at once
        </dd>
        {a.pausedReason && (
          <>
            <dt className="text-ink/55">Paused</dt>
            <dd className="text-warn">{a.pausedReason}</dd>
          </>
        )}
        <dt className="text-ink/55">Method</dt>
        <dd>{a.auth.method ?? "–"}</dd>
        <dt className="text-ink/55">Login expires</dt>
        <dd className={cn(exp !== null && exp < Date.now() + 7 * 86_400_000 && "text-warn")}>{when(a.auth.expiresAt)}</dd>
        <dt className="text-ink/55">Long-lived token</dt>
        <dd className={cn(a.token.state === "rejected" && "text-bad")}>
          {a.token.state === "none" && "none"}
          {a.token.state === "set" && `set ${when(a.token.setAt)}${a.token.expiresAt ? `, expires about ${a.token.expiresAt.slice(0, 10)}` : ""}`}
          {a.token.state === "rejected" && `rejected ${when(a.token.rejectedAt)}`}
        </dd>
        <dt className="text-ink/55">Status read</dt>
        <dd>{a.auth.checkedAt ? eventTime(a.auth.checkedAt) : "never"}</dd>
        <dt className="text-ink/55">Usage read</dt>
        <dd>{a.usage.readAt ? eventTime(a.usage.readAt) : "never"}</dd>
      </dl>
      {operator && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button size="sm" variant="primary" icon={KeyIcon} loading={write.busy === "login"} className="max-md:h-11"
            onClick={() => act("login", async () => { await api.accounts.loginStart(a.id); setSigning("login"); })}>
            Sign in
          </Button>
          <Button size="sm" variant="ghost" icon={LockKeyIcon} loading={write.busy === "token"} className="max-md:h-11"
            onClick={() => act("token", async () => { await api.accounts.tokenStart(a.id); setSigning("token"); })}>
            Long-lived token
          </Button>
          {a.token.state !== "none" && <ConfirmButton label="Remove token" confirmLabel="Confirm remove" loading={write.busy === "rmtoken"} onConfirm={() => act("rmtoken", () => api.accounts.tokenRemove(a.id))} />}
          {a.auth.loggedIn && <ConfirmButton label="Sign out" confirmLabel="Confirm sign out" loading={write.busy === "out"} onConfirm={() => act("out", () => api.accounts.signOut(a.id))} />}
          <Button size="sm" variant="ghost" loading={write.busy === "enabled"} className="max-md:h-11" onClick={() => act("enabled", () => api.accounts.update(a.id, { enabled: !a.enabled }))}>
            {a.enabled ? "Disable" : "Enable"}
          </Button>
          <Button size="sm" variant="ghost" loading={write.busy === "refresh"} className="max-md:h-11" onClick={() => act("refresh", () => api.accounts.refresh(a.id))}>
            Refresh
          </Button>
          <ErrorLine error={write.error} className="basis-full" />
        </div>
      )}
      {editing && <EditForm a={a} onDone={() => { setEditing(false); onChanged(); }} />}
      {signing && <LoginDialog a={a} kind={signing} onClose={() => { setSigning(null); onChanged(); }} />}
    </li>
  );
}

function AddForm({ onAdded }: { onAdded: () => void }) {
  const api = useApi();
  const write = useWrite();
  const [label, setLabel] = useState("");
  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void write.run("add", () => api.accounts.add(label.trim())).then((ok) => ok && (setLabel(""), onAdded()));
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-ink/60">
        Label
        <TextInput value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} className="w-56 text-ink" />
      </label>
      <Button type="submit" variant="primary" size="sm" disabled={!label.trim()} loading={write.busy === "add"} className="max-md:h-11">
        Add account
      </Button>
      <ErrorLine error={write.error} className="basis-full" />
    </form>
  );
}

export function AccountsView() {
  const q = useList();
  const operator = useUser().role === "operator";
  return (
    <Page title="Accounts" sub="Claude accounts for agent runs">
      <div className="mt-4 space-y-4">
        <Block title="Pauses and Jev">
          <PauseLevels operator={operator} />
          <JevLine operator={operator} />
        </Block>
        <Block title="Claude accounts">
          <ErrorLine error={q.error?.message} />
          {operator && <AddForm onAdded={q.refetch} />}
          {q.data && q.data.length === 0 && <p className="text-sm text-ink/55">No account yet.</p>}
          {q.data && (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {q.data.map((a) => (
                <Row key={a.id} a={a} operator={operator} onChanged={q.refetch} />
              ))}
            </ul>
          )}
        </Block>
      </div>
    </Page>
  );
}

