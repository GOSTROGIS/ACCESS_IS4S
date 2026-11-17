import { useEffect, useState } from "react";

export function useMedia(query: string) {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}

/** Phones and narrow windows get the stacked single-column layout. */
export const useIsPhone = () => useMedia("(max-width: 767px)");
