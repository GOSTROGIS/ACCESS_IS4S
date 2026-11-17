import type { AnchorHTMLAttributes } from "react";
import { Link } from "react-router-dom";
import { cn } from "../cn";
import { safeHref } from "../safeHref";

const cls = "text-accent-ink hover:underline";

export type TextLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  ({ to: string; href?: never } | { href: string; to?: never });

/** Accent text link. `to` is an in-app route; `href` opens in a new tab. */
export function TextLink({ to, href, className, ...rest }: TextLinkProps) {
  if (to !== undefined) return <Link to={to} className={cn(cls, className)} {...rest} />;
  return <a href={safeHref(href)} target="_blank" rel="noreferrer" className={cn(cls, className)} {...rest} />;
}
