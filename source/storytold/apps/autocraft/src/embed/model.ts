// Sentence-embedding models run locally on the CPU through ONNX Runtime
// (@huggingface/transformers). Model files are downloaded from Hugging Face
// once into the model cache and read from there afterwards.
import { homedir } from "node:os";
import { join } from "node:path";
import { envVar } from "../env.ts";

export type Role = "item" | "query";

export interface Embedder {
  // Stored with every vector; vectors of another model are embedded again.
  readonly id: string;
  readonly dim: number;
  // Unit-length vectors, one per text.
  embed(texts: string[], role: Role): Promise<Float32Array[]>;
}

type ModelSpec = {
  repo: string;
  // Commit of the model repo; the loader fetches and caches exactly this revision.
  revision: string;
  dim: number;
  pooling: "cls" | "mean";
  prefix: Record<Role, string>;
};

// Item-to-item similarity is symmetric, so items get the query-side prefix
// where a model has one only for short searches (bge) or for both (e5).
export const MODELS: Record<string, ModelSpec> = {
  "bge-small-en-v1.5": {
    repo: "Xenova/bge-small-en-v1.5", revision: "ea104dacec62c0de699686887e3f920caeb4f3e3", dim: 384, pooling: "cls",
    prefix: { item: "", query: "Represent this sentence for searching relevant passages: " },
  },
  "multilingual-e5-small": {
    repo: "Xenova/multilingual-e5-small", revision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78", dim: 384, pooling: "mean",
    prefix: { item: "query: ", query: "query: " },
  },
  "all-MiniLM-L6-v2": {
    repo: "Xenova/all-MiniLM-L6-v2", revision: "751bff37182d3f1213fa05d7196b954e230abad9", dim: 384, pooling: "mean",
    prefix: { item: "", query: "" },
  },
};

export const DEFAULT_MODEL = "bge-small-en-v1.5";
export const MAX_TOKENS = 256;

export function modelCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  const given = envVar("MODEL_CACHE", env);
  if (given) return given;
  return join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "autocraft/models");
}

export function modelName(env: NodeJS.ProcessEnv = process.env): string {
  const name = envVar("EMBED_MODEL", env) || DEFAULT_MODEL;
  if (!MODELS[name]) throw new Error(`unknown embedding model ${name}; one of ${Object.keys(MODELS).join(", ")}`);
  return name;
}

type Tensor = { data: Float32Array; dims: number[] };
type Tokenized = Record<string, unknown> & { attention_mask: { data: BigInt64Array; dims: number[] } };

export const embedderId = (name: string): string => `${name}:q8:${MAX_TOKENS}`;

type Runner = (texts: string[]) => Promise<{ data: Float32Array; dims: number[]; mask: BigInt64Array }>;

async function loadRunner(spec: ModelSpec, threads: number, cacheDir: string): Promise<Runner> {
  const tf = await import("@huggingface/transformers");
  tf.env.cacheDir = cacheDir;
  const session_options = { intraOpNumThreads: threads, interOpNumThreads: 1 };
  const tokenizer = await tf.AutoTokenizer.from_pretrained(spec.repo, { revision: spec.revision });
  const model = await tf.AutoModel.from_pretrained(spec.repo, { revision: spec.revision, dtype: "q8", device: "cpu", session_options });
  return async (texts) => {
    const enc = tokenizer(texts, { padding: true, truncation: true, max_length: MAX_TOKENS }) as unknown as Tokenized;
    const h = ((await model(enc)) as { last_hidden_state: Tensor }).last_hidden_state;
    return { data: h.data, dims: h.dims, mask: enc.attention_mask.data };
  };
}

// The model loads on the first embed() call, so a server that never embeds
// never loads it. `threads` caps ONNX Runtime's intra-op threads.
export function localEmbedder(opts: { name?: string; threads?: number; cacheDir?: string } = {}): Embedder {
  const name = opts.name ?? modelName();
  const spec = MODELS[name];
  if (!spec) throw new Error(`unknown embedding model ${name}`);
  const dim = spec.dim;
  let runner: Promise<Runner> | null = null;
  return {
    id: embedderId(name),
    dim,
    async embed(texts, role) {
      if (!texts.length) return [];
      if (!runner) {
        runner = loadRunner(spec, opts.threads ?? 4, opts.cacheDir ?? modelCacheDir());
        runner.catch(() => { runner = null; });
      }
      const h = await (await runner)(texts.map((t) => spec.prefix[role] + t));
      const [n, len] = [h.dims[0]!, h.dims[1]!];
      const vecs: Float32Array[] = [];
      for (let i = 0; i < n; i++) {
        const v = new Float32Array(dim);
        if (spec.pooling === "cls") {
          v.set(h.data.subarray(i * len * dim, i * len * dim + dim));
        } else {
          let count = 0;
          for (let t = 0; t < len; t++) {
            if (!h.mask[i * len + t]) continue;
            count++;
            const off = (i * len + t) * dim;
            for (let d = 0; d < dim; d++) v[d]! += h.data[off + d]!;
          }
          if (count) for (let d = 0; d < dim; d++) v[d]! /= count;
        }
        vecs.push(normalize(v));
      }
      return vecs;
    },
  };
}

export function normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
  const k = s > 0 ? 1 / Math.sqrt(s) : 0;
  for (let i = 0; i < v.length; i++) v[i]! *= k;
  return v;
}
