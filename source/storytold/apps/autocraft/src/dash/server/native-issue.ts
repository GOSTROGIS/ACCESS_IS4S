import { connect } from "../../db.ts";
import { loadConfig } from "./config.ts";
import { issueNativeHandoff, nativeOwner } from "./native-signin.ts";

// This entry is invoked by the authenticated native SSH transport, never by HTTP.
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--product" || !["access", "slipcurve"].includes(args[1]!)) throw new Error();
  const config = loadConfig();
  if (nativeOwner(config)?.product !== args[1]) throw new Error();
  let input = "";
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (Buffer.byteLength(input, "utf8") > 8192) throw new Error();
  }
  const body = JSON.parse(input) as { access?: unknown };
  input = "";
  if (!body || Object.keys(body).join(",") !== "access" || typeof body.access !== "string") throw new Error();
  const db = connect(config.dbPath);
  try { process.stdout.write(JSON.stringify(await issueNativeHandoff(config, db, body.access)) + "\n"); }
  finally { db.close(); body.access = ""; }
} catch {
  process.stderr.write("Native sign-in could not verify the configured owner or protected runtime.\n");
  process.exitCode = 1;
}
