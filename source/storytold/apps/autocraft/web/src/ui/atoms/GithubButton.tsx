import { GithubLogoIcon } from "@phosphor-icons/react";
import { cn } from "../cn";
import { safeHref } from "../safeHref";

/**
 * A small secondary button with the GitHub logo, a link to `href` in a new tab. The negative margin keeps the row's
 * height; an invisible hit area around it reaches 44 px on touch screens. It sets `relative z-10`,
 * so it stays clickable inside a stretched row.
 */
export function GithubButton({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <a
      href={safeHref(href)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title="Open on GitHub"
      className={cn(
        "relative z-10 -my-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-line-strong bg-raised text-ink/70 hover:bg-ink/[0.06] hover:text-ink",
        "after:absolute after:left-1/2 after:top-1/2 after:size-7 after:-translate-x-1/2 after:-translate-y-1/2 [@media(pointer:coarse)]:after:size-11",
        className,
      )}
    >
      <GithubLogoIcon aria-hidden size="1.1em" weight="bold" />
    </a>
  );
}
