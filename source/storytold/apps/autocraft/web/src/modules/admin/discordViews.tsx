import { Fragment, useEffect, useState } from "react";
import { useApi, useQuery } from "../../api/client";
import type { DiscordSetup } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { Badge, type Tone } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { Input } from "../../ui/atoms/Input";
import { Select } from "../../ui/atoms/Select";
import { Switch } from "../../ui/atoms/Switch";
import { TextLink } from "../../ui/atoms/TextLink";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { Avatar } from "../../ui/atoms/Avatar";
import { ConfirmButton } from "../../ui/molecules/ConfirmButton";
import { Block } from "../../ui/molecules/Block";
import { Facts } from "../../ui/molecules/Facts";
import { Page } from "../../ui/organisms/Page";
import { useWrite } from "../../lib/hooks";

const STATE: Record<DiscordSetup["state"], [string, Tone]> = {
  off: ["Off", "neutral"], connecting: ["Connecting", "warn"], connected: ["Connected", "ok"], reconnecting: ["Reconnecting", "warn"], failed: ["Failed", "bad"],
};

export function DiscordView(_: ViewProps) {
  const { data, error, refetch } = useQuery("discord-setup", (api) => api.discord.setup());
  const api = useApi();
  const write = useWrite();
  const guilds = data ? [...new Set(data.channels.map((c) => c.guildId))] : [];
  return (
    <Page title="Discord">
      <ErrorLine error={error?.message ?? write.error} className="mt-3" />
      {data && (
        <>
          <Block className="mt-4" title="Connection" aside={<Badge tone={STATE[data.state][1]}>{STATE[data.state][0]}</Badge>}>
            <Facts
              rows={[
                ["State since", data.at ? <TimeAgo key="at" iso={data.at} /> : null],
                ["Detail", data.detail],
                ["Privacy page", <TextLink key="p" href={data.privacyPath}>{data.privacyPath}</TextLink>],
              ]}
            />
            {data.state === "off" && <p className="mt-2 text-sm text-ink/55">The runner has no Discord token file.</p>}
          </Block>
          <Block className="mt-4" title="Channels" aside={`${data.channels.filter((c) => c.watched).length} watched`} flush>
            {data.channels.length === 0 && <div className="px-4 py-3 text-sm text-ink/55">The bot has reported no channels.</div>}
            {guilds.map((g) => (
              <div key={g} className="border-b border-line last:border-0">
                <div className="flex flex-wrap items-baseline gap-x-2 bg-ink/[0.03] px-4 py-2 text-sm font-medium">
                  {data.channels.find((c) => c.guildId === g)?.guildName ?? "Server"}
                  <span className="num text-2xs font-normal text-ink/45">{g}</span>
                </div>
                <ul>
                  {data.channels.filter((c) => c.guildId === g).map((c, i, all) => (
                    <Fragment key={c.channelId}>
                    {c.category !== null && c.category !== (all[i - 1]?.category ?? null) && (
                      <li className="border-t border-line bg-ink/[0.02] px-4 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-ink/45 first:border-0">{c.category}</li>
                    )}
                    <li className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-1.5 first:border-0">
                      <div className="min-w-0 max-md:basis-full md:flex-1">
                        <div className="truncate text-sm">#{c.name ?? "unnamed"}</div>
                        <div className="num truncate text-2xs text-ink/45">{c.channelId}</div>
                      </div>
                      <Select
                        size="sm"
                        value={c.defaultRepo ?? ""}
                        disabled={write.busy === `repo:${c.channelId}`}
                        aria-label={`Default repo for new issues from #${c.name ?? c.channelId}`}
                        onChange={(e) => void write.run(`repo:${c.channelId}`, () => api.discord.setChannelRepo(c.channelId, e.target.value || null)).then(() => refetch())}
                        className="max-md:flex-1 md:max-w-40"
                      >
                        <option value="">No default repo</option>
                        {data.repos.map((r) => <option key={r} value={r}>{r}</option>)}
                      </Select>
                      <Switch on={c.watched} label={`Watch #${c.name ?? c.channelId}`} busy={write.busy === c.channelId} onChange={(on) => void write.run(c.channelId, () => api.discord.setChannel(c.channelId, on)).then(() => refetch())} />
                    </li>
                    </Fragment>
                  ))}
                </ul>
              </div>
            ))}
          </Block>
          <LinksBlock links={data.links} busy={write.busy} onRemove={(id) => write.run(id, () => api.discord.removeLink(id)).then(() => refetch())} />
          <Block className="mt-4" title="Reactions">
            <div className="flex min-h-11 items-center gap-3">
              <span className="min-w-0 flex-1 text-sm">React to recorded messages</span>
              <Switch on={data.reactOn} label="React to recorded messages" busy={write.busy === "react"} onChange={(on) => void write.run("react", () => api.discord.setReact(on)).then(() => refetch())} />
            </div>
          </Block>
          <ContactBlock contact={data.contact} onSave={(c) => write.run("contact", () => api.discord.setContact(c)).then(() => refetch())} busy={write.busy === "contact"} />
        </>
      )}
    </Page>
  );
}

function ContactBlock({ contact, onSave, busy }: { contact: string; onSave: (c: string) => void; busy: boolean }) {
  const [v, setV] = useState(contact);
  useEffect(() => setV(contact), [contact]);
  return (
    <Block className="mt-4" title="Deletion requests">
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
        <Input value={v} onChange={(e) => setV(e.target.value)} maxLength={300} placeholder="Contact shown on the privacy page" aria-label="Contact for deletion requests" className="w-full sm:w-96" />
        <Button type="submit" variant="primary" disabled={busy || v.trim() === contact} className="max-md:h-11 max-md:w-full">
          Save
        </Button>
      </form>
    </Block>
  );
}

function LinksBlock({ links, busy, onRemove }: { links: DiscordSetup["links"]; busy: string | null; onRemove: (id: string) => void }) {
  return (
    <Block className="mt-4" title="Linked accounts" aside={`${links.length}`} flush>
      {links.length === 0 && <div className="px-4 py-3 text-sm text-ink/55">No Discord account is linked.</div>}
      <ul>
        {links.map((l) => (
          <li key={l.id} className="flex min-h-11 items-center gap-3 border-t border-line px-4 py-1.5 first:border-0">
            <Avatar login={l.login} size={20} />
            <span className="min-w-0 flex-1 truncate text-sm">{l.login}</span>
            <span className="text-2xs text-ink/45"><TimeAgo iso={l.linkedAt} /></span>
            <ConfirmButton label="Remove" confirmLabel="Confirm remove" loading={busy === l.id} onConfirm={() => onRemove(l.id)} />
          </li>
        ))}
      </ul>
    </Block>
  );
}
