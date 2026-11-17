// The overflow menu on a Queue row: fast track and its weight, merge hold and, for batch members, remove from batch. Operators only.
import { DropdownMenu } from "radix-ui";
import { CaretRightIcon, CheckIcon, DotsThreeIcon, FastForwardIcon, PauseIcon, PlayIcon, ScalesIcon, SignOutIcon } from "@phosphor-icons/react";
import { useApi } from "../../api/client";
import type { FastPosition } from "../../api/types";
import { useUser } from "../../shell/UserContext";
import { cn } from "../../ui/cn";
import { ErrorLine, useWrite } from "../admin/parts";
import { refOf, WEIGHT_DEFAULT, WEIGHTS } from "./fastTrack";

const menuCls = "z-50 min-w-[200px] rounded-md border border-line-strong bg-raised p-1 shadow-[0_12px_32px_rgba(0,0,0,0.28)] animate-rise";
const itemCls = "flex h-8 cursor-default items-center gap-2.5 rounded px-2 text-sm outline-none data-[highlighted]:bg-ink/[0.07] max-md:h-11";

export function RowMenu({ repo, number, fast, held, pr, inBatch }: { repo: string; number: number; fast: FastPosition | null; held: boolean; pr: boolean; inBatch?: boolean }) {
  const api = useApi();
  const write = useWrite();
  if (useUser().role !== "operator") return null;
  const ref = refOf(repo, number);
  const run = (key: string, f: () => Promise<unknown>) => () => void write.run(key, f);
  return (
    <span className="relative z-10 inline-flex flex-col items-end">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" aria-label={`Actions for ${ref}`} className="inline-flex size-7 items-center justify-center rounded text-ink/60 outline-none hover:bg-ink/[0.07] hover:text-ink data-[state=open]:bg-ink/[0.07] max-md:size-11">
            <DotsThreeIcon size={20} weight="bold" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className={menuCls}>
            <DropdownMenu.Item className={itemCls} onSelect={run("fast", () => (fast ? api.queueControl.fastTrackRemove(ref) : api.queueControl.fastTrackAdd(ref)))}>
              <FastForwardIcon size={16} />
              {fast ? "Remove fast track" : "Fast track"}
            </DropdownMenu.Item>
            {fast && (
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className={cn(itemCls, "data-[state=open]:bg-ink/[0.07]")}>
                  <ScalesIcon size={16} />
                  Weight
                  <span className="num ml-auto text-xs text-ink/55">{fast.weight ?? WEIGHT_DEFAULT}</span>
                  <CaretRightIcon size={12} className="text-ink/45" />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent sideOffset={4} collisionPadding={8} className={cn(menuCls, "min-w-[120px]")}>
                    <DropdownMenu.RadioGroup value={String(fast.weight ?? WEIGHT_DEFAULT)} onValueChange={(v) => void write.run("weight", () => api.queueControl.fastTrackWeight(ref, Number(v)))}>
                      {WEIGHTS.map((w) => (
                        <DropdownMenu.RadioItem key={w} value={String(w)} className={itemCls}>
                          <span className="inline-flex w-4 justify-center">
                            <DropdownMenu.ItemIndicator>
                              <CheckIcon size={14} />
                            </DropdownMenu.ItemIndicator>
                          </span>
                          <span className="num">{w}</span>
                          {w === WEIGHTS[0] && <span className="ml-auto text-xs text-ink/50">first</span>}
                          {w === WEIGHTS[WEIGHTS.length - 1] && <span className="ml-auto text-xs text-ink/50">last</span>}
                        </DropdownMenu.RadioItem>
                      ))}
                    </DropdownMenu.RadioGroup>
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            )}
            {pr && (
              <DropdownMenu.Item className={itemCls} onSelect={run("hold", () => (held ? api.queueControl.release(ref) : api.queueControl.hold(ref)))}>
                {held ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
                {held ? "Release" : "Hold merge"}
              </DropdownMenu.Item>
            )}
            {inBatch && (
              <DropdownMenu.Item className={itemCls} onSelect={run("batch", () => api.queueControl.batchRemove(ref))}>
                <SignOutIcon size={16} />
                Remove from batch
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ErrorLine error={write.error} className="max-w-[180px] text-2xs" />
    </span>
  );
}
