import { useApi } from "../api/client";
import { Button } from "../ui/atoms/Button";
import { ErrorLine } from "../ui/atoms/ErrorLine";
import { Dialog } from "../ui/molecules/Dialog";
import { useWrite } from "../lib/hooks";

/** Confirmation to remove the signed-in user's Discord link; `onDone` runs after it is removed. */
export function UnlinkDiscordDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const api = useApi();
  const write = useWrite();
  return (
    <Dialog open={open} onClose={onClose} title="Unlink Discord">
      <p className="text-sm text-ink/80">The bot will no longer know your Discord account as this login. You can link it again from Discord.</p>
      <ErrorLine error={write.error} className="mt-2" />
      <div className="mt-4 flex gap-2 max-md:flex-col-reverse md:justify-end">
        <Button className="max-md:h-11" onClick={onClose}>Cancel</Button>
        <Button variant="destructive" className="max-md:h-11" loading={write.busy === "unlink"}
          onClick={() => void write.run("unlink", () => api.discord.unlinkOwn()).then((ok) => { if (ok) { onDone(); onClose(); } })}>
          Unlink
        </Button>
      </div>
    </Dialog>
  );
}
