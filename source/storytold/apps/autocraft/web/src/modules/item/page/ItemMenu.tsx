// The operator's overflow menu on the item page: fast track, merge hold and the releases the item allows.
import { useEffect, useState } from "react";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { DropdownMenu } from "radix-ui";
import { useApi } from "../../../api/client";
import type { ItemPageData, ItemReleases, ReleaseAction } from "../../../api/types";
import { useWrite } from "../../../lib/hooks";
import { ErrorLine } from "../../admin/parts";
import { refOf, useFastTrack, useHeldMerges } from "../../queue/fastTrack";

const RELEASES: { key: keyof ItemReleases; action: ReleaseAction; label: string; confirm: string }[] = [
  { key: "reviewAgain", action: "review-again", label: "Review again at this head", confirm: "Delete the hold, review again" },
  { key: "verifyAgain", action: "verify-again", label: "Verify again", confirm: "Plan Verify again" },
  { key: "fixAgain", action: "fix-again", label: "Try the fix again", confirm: "Forget the attempt, try again" },
  { key: "batchAgain", action: "batch-again", label: "Try the batch again", confirm: "Release the PR, try the batch again" },
];

const itemCls = "flex h-8 cursor-default items-center rounded px-2 text-sm outline-none data-[highlighted]:bg-ink/[0.07] data-[disabled]:opacity-50 max-md:h-11";

/** A menu entry; with `confirm` the first select keeps the menu open and shows the confirm text, the second runs it. */
function Entry({ label, confirm, busy, onRun }: { label: string; confirm?: string; busy?: boolean; onRun: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <DropdownMenu.Item
      disabled={busy}
      className={itemCls + (armed ? " text-bad" : "")}
      onSelect={(e) => {
        if (confirm && !armed) {
          e.preventDefault();
          setArmed(true);
          return;
        }
        setArmed(false);
        onRun();
      }}
    >
      {armed ? confirm : label}
    </DropdownMenu.Item>
  );
}

/** Operators only; renders nothing when no action applies. */
export function ItemMenu({ d }: { d: ItemPageData }) {
  const api = useApi();
  const write = useWrite();
  const fast = useFastTrack();
  const held = useHeldMerges();
  const open = d.state === "open";
  const ref = refOf(d.repo, d.number);
  const fastOn = fast.includes(ref);
  const holdOn = held.includes(ref);
  const releases = RELEASES.filter((r) => d.header.releases[r.key]);
  const hasHold = open && d.kind === "pr";
  if (!open && releases.length === 0) return null;
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger aria-label="More actions" className="flex size-8 shrink-0 items-center justify-center rounded border border-line-strong hover:bg-ink/[0.06] max-md:size-11"><DotsThreeIcon weight="bold" /></DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[210px] rounded-md border border-line-strong bg-raised p-1 shadow-[0_12px_32px_rgba(0,0,0,0.28)] animate-rise">
            {open && <Entry label={fastOn ? "Remove fast track" : "Fast track"} busy={write.busy === "fast"} onRun={() => void write.run("fast", () => (fastOn ? api.queueControl.fastTrackRemove(ref) : api.queueControl.fastTrackAdd(ref)))} />}
            {hasHold && <Entry label={holdOn ? "Release the merge hold" : "Hold merge"} busy={write.busy === "hold"} onRun={() => void write.run("hold", () => (holdOn ? api.queueControl.release(ref) : api.queueControl.hold(ref)))} />}
            {releases.map((r) => (
              <Entry key={r.action} label={r.label} confirm={r.confirm} busy={write.busy === r.action} onRun={() => void write.run(r.action, () => api.release(d.repo, d.number, r.action))} />
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {write.error && <ErrorLine error={write.error} className="basis-full" />}
    </>
  );
}
