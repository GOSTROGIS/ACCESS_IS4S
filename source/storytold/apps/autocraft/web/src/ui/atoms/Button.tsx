// Variant set adapted from ArtCraft libs/components/button (MIT OR Apache-2.0),
// restyled as developer-tool controls: sentence-case labels, 28/32 px heights.
import { forwardRef, type ButtonHTMLAttributes } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { cn } from "../cn";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: PhosphorIcon;
  iconAfter?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const variants = {
  primary: "bg-accent text-white border-accent hover:bg-accent/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
  secondary: "bg-raised text-ink border-line-strong hover:bg-ink/[0.06]",
  ghost: "bg-transparent text-ink/70 border-transparent hover:text-ink hover:bg-ink/[0.06]",
  destructive: "bg-transparent text-bad border-bad/40 hover:bg-bad/10",
};
const sizes = {
  sm: "h-7 px-2.5 gap-1.5 text-xs",
  md: "h-8 px-3 gap-1.5 text-sm",
  lg: "h-11 px-4 gap-2 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { icon: Icon, iconAfter, variant = "secondary", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  const icon = loading ? <CircleNotchIcon className="animate-spin" /> : Icon ? <Icon /> : null;
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded border font-medium transition-colors duration-fast",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {!iconAfter && icon}
      {children}
      {iconAfter && icon}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, className, size = "md", ...rest },
  ref,
) {
  const box = { sm: "size-7", md: "size-8", lg: "size-11" }[size];
  return <Button ref={ref} aria-label={label} title={label} variant="ghost" size={size} className={cn(box, "px-0", className)} {...rest} />;
});
