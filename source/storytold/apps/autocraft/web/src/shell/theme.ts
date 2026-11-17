import { useEffect, useState } from "react";

export type ThemePref = "system" | "dark" | "light";
const KEY = "autocraft:theme";

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light" || v === "system") return v;
  } catch {
    /* storage blocked */
  }
  return "system";
}

const mq = () => window.matchMedia("(prefers-color-scheme: light)");

export function applyTheme(pref: ThemePref) {
  const light = pref === "light" || (pref === "system" && mq().matches);
  const el = document.documentElement;
  el.classList.toggle("theme-light", light);
  el.classList.toggle("theme-dark", !light);
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(read);
  useEffect(() => {
    applyTheme(pref);
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* storage blocked */
    }
    if (pref !== "system") return;
    const m = mq();
    const on = () => applyTheme("system");
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [pref]);
  return [pref, setPref];
}

export const initTheme = () => applyTheme(read());
