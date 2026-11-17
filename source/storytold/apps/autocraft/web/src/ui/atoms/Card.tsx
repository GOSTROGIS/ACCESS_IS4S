import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "li" | "article";
  padding?: "none" | "sm" | "md";
  /** Clips children to the rounded corners (tables, flush lists). */
  clip?: boolean;
}

/** Hairline-bordered box. */
export function Card({ as: Tag = "div", padding = "none", clip, className, ...rest }: CardProps) {
  return <Tag {...rest} className={cn("rounded-md border border-line", clip && "overflow-hidden", { none: "", sm: "p-3", md: "p-4" }[padding], className)} />;
}
