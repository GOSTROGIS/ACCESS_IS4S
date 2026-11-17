import { createContext, useContext } from "react";

/** The Queue page's `item` parameter (`repo:number`): the row to mark. */
export const HighlightContext = createContext<string | undefined>(undefined);

/** True when the row of `repo#number` is the linked item. */
export const useIsLinked = (repo: string, number: number): boolean => useContext(HighlightContext) === `${repo}:${number}`;
