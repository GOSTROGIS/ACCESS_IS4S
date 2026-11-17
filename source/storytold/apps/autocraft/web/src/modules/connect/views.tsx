import { useState } from "react";
import { useApi, useQuery } from "../../api/client";
import type { McpToken } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { Badge } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { EmptyState } from "../../ui/atoms/EmptyState";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { Input } from "../../ui/atoms/Input";
import { Switch } from "../../ui/atoms/Switch";
import { Th } from "../../ui/atoms/Th";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { Block } from "../../ui/molecules/Block";
import { CodeBlock } from "../../ui/molecules/CodeBlock";
import { ConfirmButton } from "../../ui/molecules/ConfirmButton";
import { Page } from "../../ui/organisms/Page";
import { useIsPhone } from "../../shell/useMedia";
import { day } from "../../lib/format";
import { useWrite } from "../../lib/hooks";

/** The command that adds the server to Claude Code; other clients take the URL and header the same way. */
const claudeCommand = (url: string, token: string) => `claude mcp add --transport http autocraft-inbox ${url} --header "Authorization: Bearer ${token}"`;
const jsonConfig = (url: string, token: string) => JSON.stringify({ mcpServers: { "autocraft-inbox": { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);

export function ConnectView({ user }: ViewProps) {
  const api = useApi();
  const write = useWrite();
  const { data, error } = useQuery("mcp-tokens", (a) => a.mcp.tokens());
  const [label, setLabel] = useState("");
  const [answer, setAnswer] = useState(false);
  const [made, setMade] = useState<{ id: number; token: string } | null>(null);
  const url = `${location.origin}${data?.path ?? "/mcp"}`;
  const full = !!data && data.tokens.length >= data.max;
  const viewer = user.role === "viewer";
  const settles = user.role === "operator" || (user.role === "maintainer" && user.maintainerWrites);

  const create = () =>
    void write.run("create", async () => {
      const r = await api.mcp.create(label, settles && !!data?.answering && answer);
      setMade({ id: r.id, token: r.token });
      setLabel("");
      setAnswer(false);
    });

  return (
    <Page title="Connect your agent" sub="Work the Inbox from Claude Code or any MCP client, on your own machine and account">
      <Block className="mt-4" flush title="Agent tokens" aside={data ? `${data.tokens.length} of ${data.max}` : undefined}>
        {!viewer && <form
          className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Label, e.g. laptop" aria-label="Token label" className="min-w-[12rem] flex-1 sm:max-w-xs" />
          {settles && data?.answering && (
            <span className="flex items-center gap-2 text-sm text-ink/80">
              <Switch on={answer} onChange={setAnswer} label="Can answer decisions" />
              Can answer decisions
            </span>
          )}
          <Button type="submit" variant="primary" disabled={full} loading={write.busy === "create"} className="max-md:h-11">
            Make a token
          </Button>
          {full && <span className="text-xs text-ink/55">Revoke a token to make another.</span>}
        </form>}
        <ErrorLine error={error?.message ?? write.error} className="px-4 pt-3" />
        {made && (
          <div className="space-y-3 border-b border-line bg-accent/[0.04] px-4 py-3">
            <p className="text-sm font-medium">Copy it now: the token is shown only this once.</p>
            <CodeBlock title="Claude Code" text={claudeCommand(url, made.token)} lines={4} />
            <CodeBlock title="Other MCP clients (JSON config)" text={jsonConfig(url, made.token)} lines={12} />
            <Button size="sm" variant="ghost" onClick={() => setMade(null)}>
              Done
            </Button>
          </div>
        )}
        {data && <Tokens tokens={data.tokens} write={write} fresh={made?.id ?? null} />}
      </Block>

    </Page>
  );
}

function Tokens({ tokens, write, fresh }: { tokens: McpToken[]; write: ReturnType<typeof useWrite>; fresh: number | null }) {
  const api = useApi();
  const phone = useIsPhone();
  if (!tokens.length) return <EmptyState>No tokens yet.</EmptyState>;
  const revoke = (t: McpToken) => (
    <ConfirmButton label="Revoke" confirmLabel="Revoke now" loading={write.busy === `revoke:${t.id}`} onConfirm={() => void write.run(`revoke:${t.id}`, () => api.mcp.revoke(t.id))} />
  );
  const name = (t: McpToken) => (
    <>
      {t.label ?? <span className="text-ink/40">no label</span>}
      {t.canAnswer && <Badge className="ml-2">answers decisions</Badge>}
      {t.id === fresh && <Badge tone="accent" className="ml-2">new</Badge>}
    </>
  );
  if (phone)
    return (
      <ul>
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{name(t)}</div>
              <div className="mt-0.5 text-xs text-ink/55">
                Made {day(t.createdAt)} · {t.lastUsedAt ? <>used <TimeAgo iso={t.lastUsedAt} /></> : "never used"} · expires {day(t.expiresAt)}
              </div>
            </div>
            {revoke(t)}
          </li>
        ))}
      </ul>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead className="bg-ink/[0.03] text-xs">
          <tr className="border-b border-line">
            <Th>Label</Th>
            <Th className="w-[140px]">Made</Th>
            <Th className="w-[140px]">Last used</Th>
            <Th className="w-[140px]">Expires</Th>
            <th className="w-[120px]" aria-label="Revoke" />
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.id} className="h-10 border-b border-line last:border-0 hover:bg-ink/[0.03]">
              <td className="px-3">{name(t)}</td>
              <td className="num whitespace-nowrap px-3 text-ink/65">{day(t.createdAt)}</td>
              <td className="num whitespace-nowrap px-3 text-ink/65">{t.lastUsedAt ? <TimeAgo iso={t.lastUsedAt} /> : "never"}</td>
              <td className="num whitespace-nowrap px-3 text-ink/65">{day(t.expiresAt)}</td>
              <td className="px-3 text-right">
                {revoke(t)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
