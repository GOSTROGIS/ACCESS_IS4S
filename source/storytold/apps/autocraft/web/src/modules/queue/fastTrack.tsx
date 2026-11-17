// Fast track and merge hold: the markers and the operator's toggles (Queue rows, decision page, item page).
import { FastForwardIcon, PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useApi, useQuery } from "../../api/client";
import type { FastPosition } from "../../api/types";
import { useUser } from "../../shell/UserContext";
import { Button } from "../../ui/atoms/Button";
import { ErrorLine, useWrite } from "../admin/parts";

export const refOf = (repo: string, number: number) => `${repo}#${number}`;

export function useFastTrack() {
  const { data } = useQuery("fast-track", (api) => api.fastTrack());
  return data ?? [];
}

export function useHeldMerges() {
  const { data } = useQuery("merge-held", (api) => api.heldMerges());
  return data ?? [];
}

/** The marker before an item's ref; its tooltip gives the place among the fast-tracked items. */
export function FastMark({ fast }: { fast: FastPosition | null | undefined }) {
  if (!fast) return null;
  const text = `Fast track ${fast.position} of ${fast.of}${fast.weight === undefined ? "" : `, weight ${fast.weight}`}`;
  return (
    <span title={text} className="relative z-10 mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-accent-ink">
      <FastForwardIcon size={14} weight="regular" aria-label={text} />
      {fast.weight !== undefined && <span className="num text-2xs font-semibold">{fast.weight}</span>}
    </span>
  );
}

/** The marker for an item known by repo and number (decision and item pages). */
export function FastMarkFor({ repo, number }: { repo: string; number: number }) {
  const refs = useFastTrack();
  const i = refs.indexOf(refOf(repo, number));
  return <FastMark fast={i < 0 ? null : { position: i + 1, of: refs.length }} />;
}

/** Operators only. */
export function FastToggle({ repo, number, className }: { repo: string; number: number; className?: string }) {
  const api = useApi();
  const operator = useUser().role === "operator";
  const refs = useFastTrack();
  const write = useWrite();
  if (!operator) return null;
  const ref = refOf(repo, number);
  const on = refs.includes(ref);
  return (
    <>
      <Button
        size="sm"
        icon={FastForwardIcon}
        loading={write.busy === "fast"}
        className={className ?? "max-md:h-11"}
        onClick={() => void write.run("fast", () => (on ? api.queueControl.fastTrackRemove(ref) : api.queueControl.fastTrackAdd(ref)))}
      >
        {on ? "Remove fast track" : "Fast track"}
      </Button>
      {write.error && <ErrorLine error={write.error} />}
    </>
  );
}

/** Operators only; for pull requests. */
export function HoldToggle({ repo, number, className }: { repo: string; number: number; className?: string }) {
  const api = useApi();
  const operator = useUser().role === "operator";
  const held = useHeldMerges();
  const write = useWrite();
  if (!operator) return null;
  const ref = refOf(repo, number);
  const on = held.includes(ref);
  return (
    <>
      <Button
        size="sm"
        icon={on ? PlayIcon : PauseIcon}
        loading={write.busy === "hold"}
        className={className ?? "max-md:h-11"}
        onClick={() => void write.run("hold", () => (on ? api.queueControl.release(ref) : api.queueControl.hold(ref)))}
      >
        {on ? "Release" : "Hold merge"}
      </Button>
      {write.error && <ErrorLine error={write.error} />}
    </>
  );
}

/** Fast-track weights, heaviest (first) to lightest. */
export const WEIGHTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
export const WEIGHT_DEFAULT = 5;
