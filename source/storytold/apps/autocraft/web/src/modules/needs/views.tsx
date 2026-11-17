import { useNavigate, useSearchParams } from "react-router-dom";
import type { ViewProps } from "../../registry/types";
import { Workspace } from "../../shell/Workspace";
import { Segmented } from "../../ui/molecules/Segmented";
import { decisionsView } from "../decisions";
import { FeedbackTab } from "./FeedbackTab";
import { StoppedTab } from "./StoppedTab";
import { useSummary } from "./state";

type Tab = "decisions" | "feedback" | "stopped";
const TABS: Tab[] = ["decisions", "feedback", "stopped"];
const LABEL: Record<Tab, string> = { decisions: "Decisions", feedback: "Feedback", stopped: "Stopped" };

function useTab(): Tab {
  const [sp] = useSearchParams();
  const t = sp.get("tab");
  return TABS.includes(t as Tab) ? (t as Tab) : "decisions";
}

export function Tabs() {
  const tab = useTab();
  const navigate = useNavigate();
  const { data } = useSummary();
  const options = TABS.map((t) => ({ value: t, label: LABEL[t], count: data?.counts[t] }));
  return <Segmented label="Needs you" value={tab} options={options} onChange={(t) => navigate(t === "decisions" ? "/needs" : `/needs?tab=${t}`)} />;
}

export function Body(props: ViewProps) {
  const tab = useTab();
  if (tab === "feedback") return <FeedbackTab />;
  if (tab === "stopped") return <StoppedTab />;
  return <Workspace view={decisionsView} props={props} />;
}

