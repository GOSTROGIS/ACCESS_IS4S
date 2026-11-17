import type { Api } from "../client";
import type { AreaDef, AreaProposal, RepoAreas, User } from "../types";
import { NOW } from "./fixtures";

const SEED: AreaDef[] = [
  { name: "Canvas", description: "Drawing surface, zoom, pan and selection tools." },
  { name: "PDF import", description: "Opening and placing PDF pages; not PDF export." },
  { name: "Export", description: "Saving to image and document formats." },
  { name: "Text", description: "Text frames, fonts and typesetting." },
];

export function createAreasMock(me: User, changed: () => void): Pick<Api, "areas"> {
  const state = new Map<string, RepoAreas>();
  let nextProposal = 1, nextJob = 1;
  const of = (repo: string): RepoAreas => {
    let r = state.get(repo);
    if (!r) {
      r = {
        repo, version: 1, areas: SEED.map((a) => ({ ...a })), savedAt: new Date(NOW - 3_600_000).toISOString(), savedBy: "mosswood", unassigned: 312,
        counts: [{ area: "Canvas", open: 41 }, { area: "PDF import", open: 27 }, { area: "Export", open: 19 }, { area: "Text", open: 12 }],
        versions: [{ version: 1, at: new Date(NOW - 3_600_000).toISOString(), by: "mosswood", note: "saved a new list" }],
        proposals: [{
          id: nextProposal++, kind: "suggest", createdAt: new Date(NOW - 600_000).toISOString(), createdBy: "mosswood",
          areas: [{ name: "Accessibility", description: "Screen readers, keyboard navigation and contrast.", state: "open" }],
        } satisfies AreaProposal],
      };
      state.set(repo, r);
    }
    return r;
  };
  const need = () => {
    if (me.role !== "operator") throw new Error("only operators change area lists");
  };
  const snap = (r: RepoAreas): RepoAreas => structuredClone(r);
  const save = (r: RepoAreas, note: string) => {
    r.version = (r.version ?? 0) + 1;
    r.savedAt = new Date().toISOString();
    r.savedBy = me.login;
    r.versions = [{ version: r.version, at: r.savedAt, by: me.login, note }, ...r.versions];
    changed();
    return snap(r);
  };
  const find = (r: RepoAreas, name: string) => {
    const i = r.areas.findIndex((a) => a.name.toLowerCase() === name.toLowerCase());
    if (i < 0) throw new Error(`there is no area "${name}"`);
    return i;
  };
  return {
    areas: {
      async get(repo) {
        return snap(of(repo));
      },
      async edit(repo, e) {
        need();
        const r = of(repo);
        switch (e.op) {
          case "add":
            r.areas.push({ name: e.name, description: e.description });
            return save(r, `added ${e.name}`);
          case "rename":
            r.areas[find(r, e.from)]!.name = e.to;
            return save(r, `renamed ${e.from} to ${e.to}`);
          case "merge":
            find(r, e.into);
            r.areas.splice(find(r, e.from), 1);
            return save(r, `merged ${e.from} into ${e.into}`);
          case "remove":
            r.areas.splice(find(r, e.name), 1);
            return save(r, `removed ${e.name}`);
          case "describe":
            r.areas[find(r, e.name)]!.description = e.description;
            return save(r, `edited the description of ${e.name}`);
        }
      },
      async run() {
        need();
        return { jobId: nextJob++ };
      },
      async accept(id, body) {
        need();
        const r = [...state.values()].find((x) => x.proposals.some((p) => p.id === id));
        if (!r) throw new Error("no such proposal");
        const p = r.proposals.find((x) => x.id === id)!;
        if (p.kind === "propose") r.areas = (body?.areas ?? p.areas).map(({ name, description }) => ({ name, description }));
        else r.areas.push(...p.areas.filter((a) => body?.accept?.includes(a.name)).map(({ name, description }) => ({ name, description })));
        r.proposals = r.proposals.filter((x) => x.id !== id);
        return save(r, "saved a new list");
      },
      async dismiss(id) {
        need();
        for (const r of state.values()) r.proposals = r.proposals.filter((p) => p.id !== id);
        changed();
      },
    },
  };
}
