// `autocraft embed`: embed new and changed tracked items for similar items and
// semantic search.
import { refreshSnapshot } from "../itemtools/snapshot.ts";
import { connect } from "../db.ts";
import { localEmbedder, modelCacheDir, modelName } from "./model.ts";
import { embedItems } from "./store.ts";
import { envVar } from "../env.ts";

const USAGE = "usage: autocraft embed [--all] [--threads N] [--batch N]";
const MAX_THREADS = 8;

function intArg(args: string[], flag: string, def: number): number {
  const i = args.indexOf(flag);
  if (i < 0) return def;
  const n = Number(args[i + 1]);
  if (!Number.isInteger(n) || n < 1) {
    console.error(USAGE);
    process.exit(1);
  }
  return n;
}

async function embed(args: string[]): Promise<void> {
  await embedCommand(args);
}

/** The embed command; `onEmbedded` gets the running count of items embedded. Returns the total. */
export async function embedCommand(args: string[], onEmbedded?: (n: number) => void): Promise<number> {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--threads" || args[i] === "--batch") i++;
    else if (args[i] !== "--all") {
      console.error(USAGE);
      process.exit(1);
    }
  }
  const threads = Math.min(intArg(args, "--threads", Number(envVar("EMBED_THREADS")) || MAX_THREADS), MAX_THREADS);
  const batch = intArg(args, "--batch", 32);
  const db = connect();
  const embedder = localEmbedder({ name: modelName(), threads });
  console.error(`model ${embedder.id}, ${threads} threads, cache ${modelCacheDir()}`);
  let last = 0;
  const r = await embedItems(db, embedder, {
    all: args.includes("--all"),
    batch,
    onProgress: ({ done, total, ms }) => {
      onEmbedded?.(done);
      if (done < total && ms - last < 10_000) return;
      last = ms;
      const rate = done / (ms / 1000);
      const left = (total - done) / rate;
      console.error(`${done}/${total} items, ${rate.toFixed(1)}/s${done < total ? `, about ${Math.ceil(left / 60)} min left` : ""}`);
    },
  });
  db.close();
  console.log(`embedded ${r.embedded} items, removed ${r.pruned} stale vectors, ${(r.ms / 1000).toFixed(1)} s`);
  // The item snapshot carries the vectors; similar_items sees new ones after this.
  if (r.embedded > 0) refreshSnapshot();
  return r.embedded;
}

export const commands = {
  embed: { summary: "embed new and changed items for similar items and semantic search", run: embed },
};
