// CLI: `autocraft areas list|propose|accept|edit|rescan|suggest --repo R`. Runs the steps in this process,
// like the other stage commands; the dashboard queues the same steps as jobs.
import { connect } from "../db.ts";
import { assignAreas } from "./assign.ts";
import { proposeAreas, suggestAreas } from "./propose.ts";
import { acceptProposal, areaCounts, currentList, decideSuggestion, editAreas, proposalsOf, unassignedCount, type AreaEdit } from "./store.ts";

const USAGE = "areas list|propose|accept [--id N] [--names A,B]|edit add NAME DESCRIPTION|rename FROM TO|merge FROM INTO|remove NAME|describe NAME DESCRIPTION|rescan [--limit N]|suggest --repo R";
const BY = "cli";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** The arguments without the flags and their values. */
function positional(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i]!.startsWith("--")) i++;
    else out.push(args[i]!);
  }
  return out;
}

function editOf(words: string[]): AreaEdit {
  const [op, a, b] = words;
  switch (op) {
    case "add": if (a && b) return { op, name: a, description: b }; break;
    case "rename": if (a && b) return { op, from: a, to: b }; break;
    case "merge": if (a && b) return { op, from: a, into: b }; break;
    case "remove": if (a) return { op, name: a }; break;
    case "describe": if (a && b) return { op, name: a, description: b }; break;
  }
  throw new Error(`usage: autocraft areas --repo R ${USAGE}`);
}

export const commands = {
  areas: {
    summary: `areas --repo R ${USAGE}`,
    async run(args: string[]): Promise<void> {
      const repo = flag(args, "--repo"), words = positional(args);
      const what = words.shift();
      if (!repo || !what) throw new Error(`usage: autocraft areas --repo R ${USAGE}`);
      const db = connect();
      const usageRun = `areas-cli-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`;
      switch (what) {
        case "list": {
          const cur = currentList(db, repo);
          if (!cur) console.log(`${repo} has no area list`);
          else {
            const open = new Map(areaCounts(db, repo).map((c) => [c.area, c.open]));
            console.log(`${repo}: version ${cur.version}`);
            for (const a of cur.areas) console.log(`  ${a.name} (${open.get(a.name) ?? 0} open): ${a.description}`);
            console.log(`${unassignedCount(db, repo)} open items without an area`);
          }
          for (const p of proposalsOf(db, repo)) console.log(`${p.kind} ${p.id}: ${p.areas.map((a) => `${a.name}${a.state === "open" ? "" : ` [${a.state}]`}`).join(", ")}`);
          break;
        }
        case "propose": {
          const { baseCheckout } = await import("../dupes/compare.ts");
          const id = await proposeAreas(db, repo, { by: BY, checkout: (r) => baseCheckout(db, r), usageRun, log: console.log });
          console.log(id === null ? "no usable proposal" : `proposal ${id} stored; accept it with: areas accept --repo ${repo} --id ${id}`);
          break;
        }
        case "suggest": {
          const id = await suggestAreas(db, repo, { by: BY, usageRun, log: console.log });
          console.log(id === null ? "no new area suggested" : `suggestion ${id} stored; accept areas with: areas accept --repo ${repo} --id ${id} --names "A,B"`);
          break;
        }
        case "accept": {
          const id = flag(args, "--id") ? Number(flag(args, "--id")) : proposalsOf(db, repo)[0]?.id;
          const p = proposalsOf(db, repo).find((x) => x.id === id);
          if (!p) throw new Error("no open proposal; see `areas list`");
          const version = p.kind === "propose"
            ? acceptProposal(db, p.id, BY)
            : decideSuggestion(db, p.id, BY, (flag(args, "--names") ?? "").split(",").map((x) => x.trim()).filter(Boolean));
          console.log(version ? `saved version ${version}; run: areas rescan --repo ${repo}` : "nothing accepted");
          break;
        }
        case "edit": {
          const version = editAreas(db, repo, editOf(words), BY);
          console.log(`saved version ${version}; run: areas rescan --repo ${repo}`);
          break;
        }
        case "rescan": {
          const r = await assignAreas(db, { repo, limit: Number(flag(args, "--limit") ?? 5000), rescan: true, usageRun, progress: (l) => console.log(l), log: console.log });
          console.log(`${r.due} items asked: Jev settled ${r.jev}, Haiku ${r.haiku}, ${r.none} fit none, ${r.left} unanswered`);
          break;
        }
        default:
          throw new Error(`usage: autocraft areas --repo R ${USAGE}`);
      }
    },
  },
};
