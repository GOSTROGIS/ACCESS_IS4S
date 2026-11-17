import { Fragment } from "react";
import { Link } from "react-router-dom";
import { GithubButton } from "../../ui/atoms/GithubButton";
import { githubItemUrl, itemPath } from "../../lib/links";

// A "#123" not preceded by a word character or slash; "repo#123" and URLs are left alone.
const REF = /(?<![\w/])#(\d+)\b/g;

/** Text in which every `#number` links to the item page, with a GitHub button beside it. Plain text when the repo is unknown. */
export function Refs({ text, repo }: { text: string; repo: string | null }) {
  if (!repo) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(REF)) {
    const n = Number(m[1]);
    out.push(text.slice(last, m.index));
    out.push(
      <Fragment key={m.index}>
        <Link to={itemPath(repo, n)} className="code text-accent-ink hover:underline">
          #{n}
        </Link>
        <GithubButton href={githubItemUrl(repo, n)} label={`Open ${repo}#${n} on GitHub`} className="ml-0.5 size-4 align-middle text-[0.85em]" />
      </Fragment>,
    );
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}
