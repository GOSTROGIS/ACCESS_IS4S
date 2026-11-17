import type { Decision, User } from "../../api/types";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { Kbd } from "../../ui/atoms/Kbd";
import { Button } from "../../ui/atoms/Button";
import { canActOn } from "./access";
import { localActions, refOf } from "./state";
import { WorkflowBox } from "./Workflow";

/** Several checked rows of one kind: one answer for all of them, through the Workflow box. */
export function MultiAnswer({ ds, user }: { ds: Decision[]; user: User }) {
  const operator = canActOn(user, ds);
  const kinds = new Set(ds.map((d) => d.kind));
  const optionSig = new Set(ds.map((d) => d.options.map((o) => o.key).join()));
  const same = kinds.size === 1 && optionSig.size === 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4 pr-10 text-xs text-ink/55">
        <span>{ds.length} selected</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={localActions.clearChecked}>
          Clear selection <Kbd keys="Esc" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-6 pb-10 pt-5">
          <h1 className="text-lg font-semibold">{same && operator ? `Answer ${ds.length} ${ds[0].kind} decisions together` : same ? `${ds.length} ${ds[0].kind} decisions selected` : "These decisions ask different questions"}</h1>
          <p className="mt-1 text-sm text-ink/60">{!operator ? "Open one decision to leave a comment." : same ? "One answer for all of them. Change single items afterwards from their own page." : "Select decisions of one kind to answer them together."}</p>
          <ul className="mt-4 overflow-hidden rounded-md border border-line">
            {ds.map((d) => (
              <li key={d.id} className="flex min-h-9 items-start gap-3 border-b border-line px-3 py-1.5 last:border-0">
                <div className="min-w-0 flex-1">
                  {d.number === null ? (
                    <span className="code text-sm text-ink/60">{refOf(d)}</span>
                  ) : (
                    <ItemRef repo={d.repo} number={d.number} kind={d.shown?.kind} state={d.shown?.state} title={null} />
                  )}
                  <div className="text-sm text-ink/70">{d.title}</div>
                </div>
                <span className="shrink-0 pt-0.5 text-xs text-ink/50">{d.options.find((o) => o.key === d.recommended)?.label}</span>
              </li>
            ))}
          </ul>
          {same && operator && <WorkflowBox ds={ds} user={user} />}
        </div>
      </div>
    </div>
  );
}
