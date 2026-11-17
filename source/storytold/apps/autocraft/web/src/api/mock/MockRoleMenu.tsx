import { DropdownMenu } from "radix-ui";
import { CheckIcon } from "@phosphor-icons/react";
import { mockRole, setMockRole } from "./mockApi";
import type { MockRole } from "./fixtures";

const MOCK_ROLES: [MockRole, string][] = [
  ["operator", "Operator"],
  ["maintainer", "Maintainer (write on 6 repos)"],
  ["settler", "Maintainer who settles (write on 6 repos)"],
  ["viewer", "Viewer (no write access)"],
];

/** Mockup builds only: switch the fake signed-in user. */
export default function MockRoleMenu({ itemCls, labelCls }: { itemCls: string; labelCls: string }) {
  return (
    <>
      <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-line" />
      <DropdownMenu.Label className={`${labelCls} text-warn`}>Mock data: view as</DropdownMenu.Label>
      <DropdownMenu.RadioGroup value={mockRole()} onValueChange={(v) => setMockRole(v as MockRole)}>
        {MOCK_ROLES.map(([v, l]) => (
          <DropdownMenu.RadioItem key={v} value={v} className={itemCls}>
            <span className="flex-1">{l}</span>
            <DropdownMenu.ItemIndicator>
              <CheckIcon className="text-accent-ink" />
            </DropdownMenu.ItemIndicator>
          </DropdownMenu.RadioItem>
        ))}
      </DropdownMenu.RadioGroup>
    </>
  );
}
