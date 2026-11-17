// Reports and Settings: one list each of the pages that moved out of the main navigation. A page the reader's role cannot open is left out.
import { Link } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { REPORTS, SETTINGS, openEntries, type Entry } from "./entries";

import { Page } from "../../ui/organisms/Page";
import { useUser } from "../../shell/UserContext";

function Links({ entries }: { entries: Entry[] }) {
  const user = useUser();
  const open = openEntries(user, entries);
  return (
    <ul className="mt-4 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
      {open.map((e) => (
        <li key={e.to} className="bg-panel">
          <Link to={e.to} className="flex h-12 items-center gap-3 px-4 text-sm hover:bg-ink/[0.04] max-md:h-14">
            <e.icon className="text-[17px] text-ink/55" />
            <span className="flex-1 font-medium">{e.label}</span>
            <ArrowRightIcon className="text-ink/35" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export const ReportsView = () => (
  <Page title="Reports">
    <Links entries={REPORTS} />
  </Page>
);

export const SettingsView = () => (
  <Page title="Settings">
    <Links entries={SETTINGS} />
  </Page>
);

