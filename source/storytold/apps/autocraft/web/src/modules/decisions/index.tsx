import type { ViewDef } from "../../registry/types";
import { InboxList } from "./InboxList";
import { PhoneInbox } from "./PhoneInbox";
import { DecisionsToolbar } from "./Toolbar";

/** The Decisions tab of the Needs you page: the list; a row opens the item page of its decision. */
export const decisionsView: ViewDef = {
  id: "decisions",
  title: "Decisions",
  toolbar: DecisionsToolbar,
  phone: PhoneInbox,
  panels: [{ id: "list", title: "Queue", component: InboxList, defaultSize: 100 }],
};
