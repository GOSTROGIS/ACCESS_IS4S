import type { Decision, DuplicateMember } from "../../api/types";
import { Badge, type Tone } from "../../ui/atoms/Badge";
import { Card } from "../../ui/atoms/Card";
import { ItemRef } from "../../ui/molecules/ItemRef";

const ROLE: Record<DuplicateMember["role"], { label: string; tone: Tone }> = {
  keep: { label: "Keep", tone: "ok" },
  close: { label: "Close", tone: "bad" },
  stay: { label: "Stays open", tone: "neutral" },
};

function Points({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <h3 className="text-xs font-semibold text-ink/60">{title}</h3>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm leading-[21px] text-ink/85 marker:text-ink/30">
        {items.map((t, i) => (
          <li key={i} className="[overflow-wrap:anywhere]">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The members of a duplicate group, kept one first, each with its role and its own points. */
export function DuplicateGroup({ d }: { d: Decision }) {
  const order = { keep: 0, stay: 1, close: 2 };
  const members = [...d.group].sort((a, b) => order[a.role] - order[b.role]);
  return (
    <ul className="mt-3 grid gap-2">
      {members.map((m) => {
        const role = ROLE[m.role];
        return (
          <Card as="li" key={m.number} padding="sm">
            <div className="flex items-start gap-2">
              <ItemRef repo={d.repo} number={m.number} kind={m.kind} state={m.state} title={m.title} className="flex-1" />
              <Badge tone={role.tone}>{role.label}</Badge>
            </div>
            <Points title="Does better" items={m.better} />
            <Points title="Worth carrying over" items={m.carry} />
            <Points title="Adds" items={m.adds} />
          </Card>
        );
      })}
    </ul>
  );
}

export function RiskList({ risks }: { risks: string[] }) {
  return (
    <section className="mt-3">
      <h2 className="text-xs font-semibold text-ink/60">Risks</h2>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm leading-[21px] text-ink/85 marker:text-ink/30">
        {risks.map((r, i) => (
          <li key={i} className="[overflow-wrap:anywhere]">
            {r}
          </li>
        ))}
      </ul>
    </section>
  );
}
