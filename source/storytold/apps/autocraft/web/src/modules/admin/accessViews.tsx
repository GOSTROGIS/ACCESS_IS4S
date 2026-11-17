import { useState } from "react";
import { useApi, useQuery } from "../../api/client";
import type { AccessEntry, AccessToken, Role, SessionInfo } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { Avatar } from "../../ui/atoms/Avatar";
import { Badge } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { cn } from "../../ui/cn";
import { Count } from "../../ui/atoms/Heading";
import { day, when } from "../../lib/format";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { useIsPhone } from "../../shell/useMedia";
import { Block } from "../../ui/molecules/Block";
import { ConfirmButton } from "../../ui/molecules/ConfirmButton";
import { EmptyState } from "../../ui/atoms/EmptyState";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { Input } from "../../ui/atoms/Input";
import { Page } from "../../ui/organisms/Page";
import { Select } from "../../ui/atoms/Select";
import { Th } from "../../ui/atoms/Th";
import { ROLE_LABEL, ROLES } from "./parts";
import { useWrite } from "../../lib/hooks";
import { useNow } from "../../lib/useNow";

export function AccessView({ user }: ViewProps) {
  const { data, error } = useQuery("access", (api) => api.access.overview());
  return (
    <Page title="Access" sub="Who can sign in and their sessions">
      <ErrorLine error={error?.message} className="mt-3" />
      {data && (
        <>
          <AccessList entries={data.entries} me={user.login} />
          <Sessions sessions={data.sessions} />
          <AgentTokens tokens={data.tokens} />
        </>
      )}
    </Page>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function AccessList({ entries, me }: { entries: AccessEntry[]; me: string }) {
  const api = useApi();
  const write = useWrite();
  const phone = useIsPhone();
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [note, setNote] = useState("");
  const counts = ROLES.map((r) => plural(entries.filter((e) => e.role === r).length, r)).join(", ");
  const add = () =>
    void write.run("add", () => api.access.add({ login: login.trim(), role, note: note.trim() || undefined })).then((ok) => {
      if (!ok) return;
      setLogin("");
      setNote("");
      setRole("viewer");
    });

  return (
    <Block className="mt-4" flush title={<span className="flex items-center gap-2">Access list <Count n={entries.length} /></span>} aside={`${counts}. Removing a login or changing its role ends its sessions.`}>
      <form
        className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (login.trim()) add();
        }}
      >
        <Input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="GitHub login" aria-label="GitHub login" className="w-full sm:w-44" />
        <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note, seen only by operators" aria-label="Note" className="min-w-[12rem] flex-1" />
        <Button type="submit" variant="primary" disabled={!login.trim()} loading={write.busy === "add"} className="max-md:h-11">
          Add
        </Button>
      </form>
      <ErrorLine error={write.error} className="px-4 pt-3" />
      {phone ? (
        <ul>
          {entries.map((e) => (
            <li key={e.login} className="border-b border-line px-4 py-2.5 last:border-0">
              <div className="flex items-center gap-2">
                <Who login={e.login} me={me} />
                <span className="ml-auto" />
                <RolePicker e={e} write={write} />
              </div>
              <div className="mt-1 text-xs text-ink/55">
                Added {day(e.addedAt)} by {e.addedBy ?? "–"} · {plural(e.sessions, "session")}
              </div>
              {e.note && <div className="mt-0.5 text-xs text-ink/65">{e.note}</div>}
              <div className="mt-1 flex justify-end">
                <Remove e={e} write={write} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="bg-ink/[0.03] text-xs">
              <tr className="border-b border-line">
                <Th>Login</Th>
                <Th className="w-[150px]">Role</Th>
                <Th className="w-[230px]">Added</Th>
                <Th>Note</Th>
                <Th right className="w-[80px]">Sessions</Th>
                <th className="w-[170px]" aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.login} className="h-10 border-b border-line last:border-0 hover:bg-ink/[0.03]">
                  <td className="px-3">
                    <Who login={e.login} me={me} />
                  </td>
                  <td className="px-3">
                    <RolePicker e={e} write={write} />
                  </td>
                  <td className="num whitespace-nowrap px-3 text-ink/65">
                    {day(e.addedAt)} by {e.addedBy ?? "–"}
                  </td>
                  <td className="max-w-[320px] truncate px-3 text-ink/70" title={e.note ?? undefined}>
                    {e.note ?? ""}
                  </td>
                  <td className="num px-3 text-right">{e.sessions || <span className="text-ink/30">–</span>}</td>
                  <td className="px-3 text-right">
                    <Remove e={e} write={write} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Block>
  );
}

function Who({ login, me }: { login: string; me: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar login={login} size={18} />
      <span className="truncate font-medium">{login}</span>
      {login.toLowerCase() === me.toLowerCase() && <Badge>you</Badge>}
    </span>
  );
}

type Write = ReturnType<typeof useWrite>;

function RolePicker({ e, write }: { e: AccessEntry; write: Write }) {
  const api = useApi();
  return (
    <Select size="sm"
      aria-label={`Role of ${e.login}`}
      value={e.role}
      disabled={write.busy === `role:${e.login}`}
      onChange={(ev) => void write.run(`role:${e.login}`, () => api.access.setRole(e.login, ev.target.value as Role))}
      className={cn(e.role === "operator" && "text-accent-ink")}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </Select>
  );
}

function Remove({ e, write }: { e: AccessEntry; write: Write }) {
  const api = useApi();
  return (
    <ConfirmButton
      label="Remove"
      confirmLabel={`Remove ${e.login}`}
      loading={write.busy === `remove:${e.login}`}
      onConfirm={() => void write.run(`remove:${e.login}`, () => api.access.remove(e.login))}
    />
  );
}

/** "Safari on iPhone" from a user agent string. */
function browser(ua: string | null): string {
  if (!ua) return "Unknown browser";
  const b = /Firefox\//.test(ua) ? "Firefox" : /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${b} on ${os}` : b;
}

function Sessions({ sessions }: { sessions: SessionInfo[] }) {
  useNow();
  const api = useApi();
  const write = useWrite();
  const phone = useIsPhone();
  const revoke = (s: SessionInfo) => (
    <ConfirmButton
      label="Revoke"
      confirmLabel={s.current ? "Sign me out" : "Revoke session"}
      loading={write.busy === `revoke:${s.id}`}
      onConfirm={() => void write.run(`revoke:${s.id}`, () => api.access.revokeSession(s.id))}
    />
  );
  return (
    <Block className="mt-4" flush title={<span className="flex items-center gap-2">Active sessions <Count n={sessions.length} /></span>} aside="Sessions last 14 days from the last visit">
      <ErrorLine error={write.error} className="px-4 pt-3" />
      {sessions.length === 0 && <p className="px-4 py-6 text-sm text-ink/50">No active sessions.</p>}
      {phone ? (
        <ul>
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.login}</span>
                  {s.current && <Badge tone="accent">this session</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-ink/55">
                  {browser(s.userAgent)} · seen <TimeAgo iso={s.lastSeen} />
                </div>
              </div>
              {revoke(s)}
            </li>
          ))}
        </ul>
      ) : (
        sessions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead className="bg-ink/[0.03] text-xs">
                <tr className="border-b border-line">
                  <Th>Login</Th>
                  <Th className="w-[170px]">Browser</Th>
                  <Th className="w-[150px]">Signed in</Th>
                  <Th className="w-[150px]">Last seen</Th>
                  <Th className="w-[150px]">Expires</Th>
                  <th className="w-[160px]" aria-label="Revoke" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="h-10 border-b border-line last:border-0 hover:bg-ink/[0.03]">
                    <td className="px-3">
                      <span className="flex items-center gap-2">
                        <Avatar login={s.login} size={18} />
                        <span className="font-medium">{s.login}</span>
                        {s.current && <Badge tone="accent">this session</Badge>}
                      </span>
                    </td>
                    <td className="px-3 text-ink/70" title={s.userAgent ?? undefined}>
                      {browser(s.userAgent)}
                    </td>
                    <td className="num whitespace-nowrap px-3 text-ink/65">{when(s.createdAt)}</td>
                    <td className="px-3 text-ink/65" title={when(s.lastSeen)}>
                      <TimeAgo iso={s.lastSeen} />
                    </td>
                    <td className="num whitespace-nowrap px-3 text-ink/65">{when(s.expiresAt)}</td>
                    <td className="px-3 text-right">{revoke(s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </Block>
  );
}


function AgentTokens({ tokens }: { tokens: AccessToken[] }) {
  useNow();
  const api = useApi();
  const write = useWrite();
  const revoke = (t: AccessToken) => (
    <ConfirmButton label="Revoke" confirmLabel="Revoke token" loading={write.busy === `token:${t.id}`} onConfirm={() => void write.run(`token:${t.id}`, () => api.access.revokeToken(t.id))} />
  );
  return (
    <Block className="mt-4" flush title={<span className="flex items-center gap-2">Agent tokens <Count n={tokens.length} /></span>} aside="Revoking a session also revokes that login's tokens">
      <ErrorLine error={write.error} className="px-4 pt-3" />
      {tokens.length === 0 && <EmptyState>No agent tokens.</EmptyState>}
      {tokens.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="bg-ink/[0.03] text-xs">
              <tr className="border-b border-line">
                <Th>Login</Th>
                <Th>Label</Th>
                <Th className="w-[130px]">Made</Th>
                <Th className="w-[130px]">Last used</Th>
                <Th className="w-[130px]">Expires</Th>
                <th className="w-[120px]" aria-label="Revoke" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id} className="h-10 border-b border-line last:border-0 hover:bg-ink/[0.03]">
                  <td className="px-3">
                    <span className="flex items-center gap-2">
                      <Avatar login={t.login} size={18} />
                      <span className="font-medium">{t.login}</span>
                    </span>
                  </td>
                  <td className="px-3 text-ink/70">
                    {t.label ?? ""}
                    {t.canAnswer && <Badge className="ml-2">answers decisions</Badge>}
                  </td>
                  <td className="num whitespace-nowrap px-3 text-ink/65">{day(t.createdAt)}</td>
                  <td className="num whitespace-nowrap px-3 text-ink/65">{t.lastUsedAt ? <TimeAgo iso={t.lastUsedAt} /> : "never"}</td>
                  <td className="num whitespace-nowrap px-3 text-ink/65">{day(t.expiresAt)}</td>
                  <td className="px-3 text-right">{revoke(t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Block>
  );
}
