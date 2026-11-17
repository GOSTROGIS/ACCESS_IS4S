import { useState } from "react";
import { FlagIcon, HourglassIcon } from "@phosphor-icons/react";
import { Button } from "../atoms/Button";
import { ErrorLine } from "../atoms/ErrorLine";
import { Textarea } from "../atoms/Textarea";
import { clock } from "../../lib/format";

export type QueuedInfo = { reason: string; dispute: { by: string; reason: string; at: string } | null };

/**
 * A press that waits for room under the daily GitHub write limit. The person who pressed it, and operators, dismiss it (and keep it
 * when disputed); anyone else who settles disputes it with a reason. Props only: the caller runs the calls.
 */
export function QueuedPress({ by, queued, viewer, canSettle, onDismiss, onDispute, onKeep }: {
  by: string;
  queued: QueuedInfo;
  viewer: { login: string; operator: boolean };
  canSettle: boolean;
  onDismiss: () => Promise<unknown>;
  onDispute: (reason: string) => Promise<unknown>;
  onKeep: () => Promise<unknown>;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const mine = by.toLowerCase() === viewer.login.toLowerCase();
  const owns = mine || viewer.operator;
  const disputed = queued.dispute;
  const btn = "max-md:h-11";
  const run = async (what: string, f: () => Promise<unknown>): Promise<boolean> => {
    setBusy(what);
    setError(undefined);
    try {
      await f();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-2 space-y-2 text-sm">
      <p className="flex items-start gap-1.5 font-medium text-ink/75">
        <HourglassIcon className="mt-1 shrink-0" />
        <span className="min-w-0">{by}&rsquo;s press is queued: {queued.reason}</span>
      </p>
      {disputed && (
        <div className="space-y-1">
          <p className="flex items-start gap-1.5 font-medium text-warn"><FlagIcon className="mt-1 shrink-0" weight="fill" /><span className="min-w-0">{disputed.by} disputed it at {clock(disputed.at)}</span></p>
          {disputed.reason && <p className="break-words text-ink/80">&ldquo;{disputed.reason}&rdquo;</p>}
          <p className="text-xs text-ink/55">Nothing is written to GitHub until it is kept or dismissed.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {owns && disputed && <Button size="sm" variant="primary" className={btn} loading={busy === "keep"} onClick={() => void run("keep", onKeep)}>Keep</Button>}
        {owns && <Button size="sm" variant="secondary" className={btn} loading={busy === "dismiss"} onClick={() => void run("dismiss", onDismiss)}>Dismiss</Button>}
        {!mine && canSettle && !disputed && !asking && <Button size="sm" icon={FlagIcon} className={btn} onClick={() => setAsking(true)}>Dispute</Button>}
      </div>
      {asking && (
        <div className="space-y-2">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why should this not run?" aria-label="Reason for the dispute" maxLength={2000} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="md" variant="primary" disabled={!reason.trim()} loading={busy === "dispute"} onClick={() => void run("dispute", () => onDispute(reason.trim())).then((ok) => { if (ok) { setAsking(false); setReason(""); } })} className={btn}>Send dispute</Button>
            <Button size="md" variant="ghost" onClick={() => { setAsking(false); setError(undefined); }} className={btn}>Cancel</Button>
          </div>
        </div>
      )}
      <ErrorLine error={error} className="text-xs" />
    </div>
  );
}
