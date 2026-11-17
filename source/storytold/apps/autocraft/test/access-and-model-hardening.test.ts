// Removing a login from the access list ends everything that lets a Discord account act as it.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { SCRATCH } from "./scratch.ts";
import { addLogin, removeLogin } from "../src/access.ts";
import { connect } from "../src/db.ts";
import { alertsOn, setAlerts } from "../src/discord/alerts.ts";
import { DiscordKeys } from "../src/discord/keys.ts";
import { createLinkCode, loginOf, redeemLinkCode } from "../src/discord/links.ts";

mkdirSync(SCRATCH, { recursive: true });

test("a Discord link and alert opt-in do not survive removal and re-adding of the login", () => {
  const db = connect(join(mkdtempSync(join(SCRATCH, "access-hardening-")), "t.db"));
  const keys = new DiscordKeys("k".repeat(40));
  addLogin(db, "root", "root", "operator", null);
  addLogin(db, "root", "dana", "operator", null);
  const { code } = createLinkCode(db, keys, "dana");
  assert.equal(redeemLinkCode(db, keys, code, "u1"), "dana");
  setAlerts(db, keys, "u1", "chan");
  const pending = createLinkCode(db, keys, "dana").code;
  removeLogin(db, "root", "dana");
  addLogin(db, "root", "dana", "operator", null);
  assert.equal(loginOf(db, keys, "u1"), null);
  assert.equal(alertsOn(db, keys, "u1"), false);
  assert.equal(redeemLinkCode(db, keys, pending, "u2"), null);
});
