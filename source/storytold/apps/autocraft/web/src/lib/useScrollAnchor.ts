import { useLayoutEffect, useRef, type RefObject } from "react";

const scrollParent = (el: HTMLElement): HTMLElement | null => {
  for (let p = el.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  return null;
};

/**
 * Keeps the rows in view where they are when rows are added above them. After each render the first visible child of `list`
 * is remembered; when the next render moves it, the scroll position moves by the same amount. At the top of the page nothing
 * is held, so new rows show up there.
 */
export function useScrollAnchor(list: RefObject<HTMLElement | null>, dep: unknown): void {
  const anchor = useRef<{ el: Element; top: number } | null>(null);
  useLayoutEffect(() => {
    const ul = list.current;
    const sp = ul && scrollParent(ul);
    if (!ul || !sp) return;
    const a = anchor.current;
    if (a?.el.isConnected && sp.scrollTop > 0) {
      const delta = a.el.getBoundingClientRect().top - a.top;
      if (delta !== 0) sp.scrollTop += delta;
    }
    const record = () => {
      const edge = sp.getBoundingClientRect().top;
      const first = Array.from(ul.children).find((c) => c.getBoundingClientRect().bottom > edge);
      anchor.current = first ? { el: first, top: first.getBoundingClientRect().top } : null;
    };
    record();
    // Scrolling moves the anchor too; without this the next render would scroll back to where the last render saw it.
    sp.addEventListener("scroll", record, { passive: true });
    return () => sp.removeEventListener("scroll", record);
  }, [list, dep]);
}
