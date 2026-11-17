import { Link } from "react-router-dom";
import type { ItemKind, ItemState } from "../../api/types";
import { githubItemUrl, itemPath } from "../../lib/links";
import { cn } from "../cn";
import { GithubButton } from "../atoms/GithubButton";
import { ItemIcon } from "../atoms/ItemIcon";

/**
 * An item as `[icon] repo#num full title`: the whole of it is one link to the item page (or `href`), followed by a
 * GitHub button that opens the item on GitHub (`github={false}` leaves it out). The title wraps. With `stretch` the
 * link covers the nearest positioned ancestor, so the whole row or card is the click target: that container must be
 * `relative`, and other controls in it need `relative z-10` (the GitHub button sets it itself).
 */
export function ItemRef({ repo, number, kind, state, draft, title, href, stretch, github = true, size = "md", className }: {
  repo: string;
  number: number;
  kind?: ItemKind | null;
  state?: ItemState | null;
  draft?: boolean;
  /** null while the data lacks it: only `repo#num` shows */
  title: string | null | undefined;
  href?: string;
  stretch?: boolean;
  github?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-start gap-2", size === "sm" ? "text-xs" : "text-sm", className)}>
      <Link to={href ?? itemPath(repo, number)} className={cn("flex min-w-0 flex-1 items-start gap-2 hover:underline", stretch && "after:absolute after:inset-0")}>
        <ItemIcon kind={kind} state={state} draft={draft} />
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">
          <span className="code text-ink/60">
            {repo}#{number}
          </span>
          {title ? <span className="text-ink"> {title}</span> : null}
        </span>
      </Link>
      {github && <GithubButton href={githubItemUrl(repo, number, kind)} label={`Open ${repo}#${number} on GitHub`} className="mt-[calc((1lh-1.25rem)/2)]" />}
    </span>
  );
}
