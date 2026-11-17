import { Link } from "react-router-dom";
import { CheckIcon } from "@phosphor-icons/react";
import type { Decision } from "../../api/types";
import { Badge } from "../atoms/Badge";
import { Facts } from "../molecules/Facts";
import { Markdown } from "../molecules/Markdown";
import { TimeAgo } from "../atoms/TimeAgo";

/** A decision's question, options, recommendation, feedback and answer, with a link to the decision page. */
export function DecisionSummary({ d, href }: { d: Decision; href: string }) {
  const label = (key: string | null) => d.options.find((o) => o.key === key)?.label ?? key ?? "no pick";
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-sm font-medium">{d.question}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {d.options.map((o) => (
          <li key={o.key} className="flex flex-wrap items-center gap-2">
            {d.answer === o.key ? <CheckIcon className="text-ok" /> : <span className="size-[1.15em]" />}
            <span className={d.answer === o.key ? "font-medium" : "text-ink/80"}>{o.label}</span>
            {d.recommended === o.key && <Badge tone="accent">Recommended</Badge>}
            {o.hint && <span className="text-xs text-ink/50">{o.hint}</span>}
          </li>
        ))}
      </ul>
      {d.recommendedReason && <p className="text-sm text-ink/70">{d.recommendedReason}</p>}
      {d.opinions.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {d.opinions.map((o) => (
            <li key={o.id} className="rounded border border-line px-2.5 py-1.5">
              <span className="font-medium">{o.login}</span> <span className="text-ink/60">{label(o.option)}</span> <TimeAgo iso={o.at} className="num text-xs text-ink/45" />
              {o.note && <Markdown source={o.note} className="mt-0.5" />}
            </li>
          ))}
        </ul>
      )}
      <Facts
        rows={[
          ["Answer", d.answer && <span key="a">{label(d.answer)} by {d.answeredBy}{d.answeredAt && <> <TimeAgo iso={d.answeredAt} className="num text-ink/50" /></>}</span>],
          ["Note", d.answerNote],
          ["Decision", <Link key="l" to={href} className="text-accent-ink hover:underline">Open the decision page</Link>],
        ]}
      />
    </div>
  );
}
