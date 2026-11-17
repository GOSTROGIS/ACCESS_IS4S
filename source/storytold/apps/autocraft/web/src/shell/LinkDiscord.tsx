import { useEffect, useRef, useState } from "react";
import type { DiscordLinkCode } from "../api/types";
import { useApi } from "../api/client";
import { Button } from "../ui/atoms/Button";
import { ErrorLine } from "../ui/atoms/ErrorLine";
import { Dialog } from "../ui/molecules/Dialog";

const hhmm = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** Shows a single-use code for the signed-in login. Typed into the bot in Discord, it links that Discord account. Closes itself when a link appears. */
export function LinkDiscordDialog({ open, linked, onClose }: { open: boolean; linked: boolean; onClose: () => void }) {
  const api = useApi();
  const [code, setCode] = useState<DiscordLinkCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linkedAtOpen = useRef(linked);
  useEffect(() => {
    if (!open) { setCode(null); setError(null); return; }
    linkedAtOpen.current = linked;
    let live = true;
    api.discord.linkCode().then((c) => live && setCode(c), (e: Error) => live && setError(e.message));
    return () => { live = false; };
    // The code is made once per opening; `linked` is read only to notice a later change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, api]);
  useEffect(() => { if (open && linked !== linkedAtOpen.current) onClose(); }, [open, linked, onClose]);
  return (
    <Dialog open={open} onClose={onClose} title="Link Discord">
      <p className="text-sm text-ink/80">In Discord, run this command.</p>
      <p className="mt-2 break-all rounded-md border border-line bg-ink/[0.04] px-3 py-2 font-mono text-sm select-all">
        /autocraft link code:<span className="font-semibold tracking-widest">{code?.code ?? "········"}</span>
      </p>
      {code && <p className="mt-2 text-xs text-ink/55">Works once, until {hhmm(code.expiresAt)}.</p>}
      <ErrorLine error={error} className="mt-2" />
      <div className="mt-4 flex gap-2 md:justify-end">
        <Button className="max-md:h-11 max-md:flex-1" onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  );
}
