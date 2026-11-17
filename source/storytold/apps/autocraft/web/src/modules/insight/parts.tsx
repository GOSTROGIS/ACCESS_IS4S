// Shared pieces now live in ui/; these re-exports keep other modules' imports working.
import type { ComponentProps } from "react";
import { Block as UiBlock } from "../../ui/molecules/Block";

export { Stat } from "../../ui/molecules/Stat";
export { RateBar } from "../../ui/molecules/RateBar";
export { LabelledSelect as Select } from "../../ui/molecules/LabelledSelect";
export { Th } from "../../ui/atoms/Th";

/** The insight pages' block: a flush body scrolls sideways. */
export function Block({ flush, ...rest }: Omit<ComponentProps<typeof UiBlock>, "scroll">) {
  return <UiBlock flush={flush} scroll={flush} {...rest} />;
}

/** One decimal, for rates where whole percents hide the differences. */
export const rate = (a: number, n: number) => (n ? `${((100 * a) / n).toFixed(1)}%` : "–");
