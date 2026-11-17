import type { ReactNode } from "react";
import { Button } from "../atoms/Button";

/** A step's editable draft under its line: the preview, or the editor while editing, with an Edit / Cancel edit button. Props only. */
export function StepDraft({ editing, onToggle, disabled, readOnly, preview, editor }: { editing: boolean; onToggle: () => void; disabled?: boolean; /** Shows the draft without the Edit button. */ readOnly?: boolean; preview: ReactNode; editor: ReactNode }) {
  return (
    <div className="mb-1 mt-1 space-y-1">
      {editing ? editor : preview}
      {!readOnly && (
        <Button size="sm" variant="secondary" className="max-md:h-11" disabled={disabled} onClick={onToggle}>
          {editing ? "Cancel edit" : "Edit"}
        </Button>
      )}
    </div>
  );
}
