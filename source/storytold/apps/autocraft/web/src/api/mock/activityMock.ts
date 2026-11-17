// The activity stream on fake data: the item trace's events spread over a few items.
import type { Api } from "../client";
import type { ActivityEvent } from "../types";
import { itemFor } from "./fixtures";
import { EVENTS } from "./traceMock";

const wait = <T,>(v: T, ms = 60) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
const ITEMS: [string, number][] = [["designcraft", 1484], ["photocraft", 4127], ["designcraft", 2210], ["designcraft", 2007]];
const DEFAULT_OFF = new Set(["plan"]);

const ALL: ActivityEvent[] = ITEMS.flatMap(([repo, number], i) => {
  const it = itemFor(repo, number);
  const item = { repo, number, kind: it.kind, state: it.state, title: it.title };
  // Each item's events are shifted so the stream interleaves them; later items repeat the trace twice, a day apart.
  return [0, 1].flatMap((d) => EVENTS.map((e) => ({ ...e, id: `${e.id}${d ? ":b" : ""}`, at: new Date(Date.parse(e.at) - (i * 7 + d * 1440 * (i + 1)) * 60_000).toISOString(), item })));
}).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));

export function createActivityMock(): Pick<Api, "activity"> {
  return {
    activity(q = {}) {
      const kinds = q.kinds?.length ? new Set<string>(q.kinds) : null;
      if (q.since === "mock") return wait({ unchanged: true as const, stamp: "mock" });
      let list = ALL.filter((e) => (kinds ? kinds.has(e.kind) : !DEFAULT_OFF.has(e.kind)) && (!q.repo || e.item.repo === q.repo) && (!q.autocraftOnly || e.actor.type !== "person"));
      if (q.cursor) {
        const i = list.findIndex((e) => `${e.at}|${e.id}` === q.cursor);
        list = i < 0 ? list : list.slice(i + 1);
      }
      const limit = q.limit ?? 50;
      const events = list.slice(0, limit);
      const last = events[events.length - 1];
      return wait({ events, nextCursor: list.length > limit && last ? `${last.at}|${last.id}` : null, stamp: "mock" });
    },
  };
}
