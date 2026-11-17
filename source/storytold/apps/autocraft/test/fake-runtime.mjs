#!/usr/bin/env node
// Stands in for podman in worker tests. State directory: $FAKE_RT_DIR.
// `run ... registry.test/<image> do <op>...` where each op is
//   target:FILE:TEXT  targetcheck:FILE:TEXT (exit 1 unless equal)
//   exit:N  echo:TEXT  write:REL:TEXT  big:REL:BYTES  link:REL:TARGET  sleep
// `sleep` blocks until `kill <name>` is called (then exits 137).
import { appendFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const dir = process.env.FAKE_RT_DIR;
if (!dir) process.exit(0); // node --test also loads every file under test/
const argv = process.argv.slice(2);
appendFileSync(join(dir, "calls.jsonl"), JSON.stringify(argv) + "\n");
const cmd = argv[0];
if (cmd === "ps") {
  const f = join(dir, "orphans");
  if (existsSync(f)) process.stdout.write(readFileSync(f, "utf8"));
} else if (cmd === "kill") {
  writeFileSync(join(dir, `killed-${argv[1]}`), "");
} else if (cmd === "image") {
  // image exists TAG: succeeds once `build --tag TAG` has run
  process.exitCode = existsSync(join(dir, `image-${argv[2].replaceAll("/", "_")}`)) ? 0 : 1;
} else if (cmd === "build") {
  const tag = argv[argv.indexOf("--tag") + 1];
  writeFileSync(join(dir, `image-${tag.replaceAll("/", "_")}`), readFileSync(argv[argv.indexOf("--file") + 1], "utf8"));
} else if (cmd === "run") {
  const name = argv[argv.indexOf("--name") + 1];
  const img = argv.findIndex((a) => a.startsWith("registry.test/") || a.startsWith("craft-sandbox/"));
  const ops = argv.slice(img + 1);
  const mounts = argv.flatMap((a, i) => (argv[i - 1] === "--mount" ? [a] : []));
  const outMount = mounts.find((m) => m.includes("target=/out"));
  const out = outMount.match(/source=([^,]+)/)[1];
  const target = mounts.find((m) => m.includes("target=/target")).match(/source=([^,]+)/)[1];
  const cache = mounts.find((m) => m.includes("target=/cache")).match(/source=([^,]+)/)[1];
  let code = 0;
  for (const op of ops.slice(ops[0] === "do" ? 1 : 0)) {
    const [k, a, ...rest] = op.split(":");
    const b = rest.join(":");
    if (k === "echo") console.log([a, b].filter(Boolean).join(":"));
    else if (k === "cache") {
      mkdirSync(dirname(join(cache, a)), { recursive: true });
      writeFileSync(join(cache, a), b);
    } else if (k === "target") {
      writeFileSync(join(target, a), b);
    } else if (k === "targetcheck") {
      const have = existsSync(join(target, a)) ? readFileSync(join(target, a), "utf8") : "";
      if (have !== b) {
        console.log(`target ${a} is "${have}", wanted "${b}"`);
        code = 1;
      }
    } else if (k === "exit") code = Number(a);
    else if (k === "write") {
      mkdirSync(dirname(join(out, a)), { recursive: true });
      writeFileSync(join(out, a), b);
    } else if (k === "big") {
      writeFileSync(join(out, a), "");
      truncateSync(join(out, a), Number(b));
    } else if (k === "link") {
      mkdirSync(dirname(join(out, a)), { recursive: true });
      symlinkSync(b, join(out, a));
    } else if (k === "sleep") {
      console.log("sleeping");
      await new Promise((resolve) => {
        const t = setInterval(() => {
          if (existsSync(join(dir, `killed-${name}`))) {
            clearInterval(t);
            code = 137;
            resolve();
          }
        }, 20);
      });
    }
  }
  process.exitCode = code;
}
