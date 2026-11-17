// Per-user panel layouts for react-resizable-panels. localStorage for now; the
// server can implement the same two calls later (PUT /api/me/layout/:key).
import { useState } from "react";
import type { PanelGroupStorage } from "react-resizable-panels";

export function layoutStorage(login: string): PanelGroupStorage {
  const k = (name: string) => `autocraft:${login}:${name}`;
  return {
    getItem(name) {
      try {
        return localStorage.getItem(k(name));
      } catch {
        return null;
      }
    },
    setItem(name, value) {
      try {
        localStorage.setItem(k(name), value);
      } catch {
        /* storage blocked: layout lasts for this page only */
      }
    },
  };
}

export function usePref<T>(login: string, name: string, initial: T): [T, (v: T) => void] {
  const key = `autocraft:${login}:${name}`;
  let start = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) start = JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  const [v, setV] = useState<T>(start);
  return [
    v,
    (nv: T) => {
      setV(nv);
      try {
        localStorage.setItem(key, JSON.stringify(nv));
      } catch {
        /* ignore */
      }
    },
  ];
}

