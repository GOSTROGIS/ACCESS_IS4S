import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { pollReleases, type GhRelease, type RepoReleases } from "../src/downloads/poll.ts";
import { readSeqs } from "../src/live.ts";
import { downloadsReport } from "../src/downloads/report.ts";

const T0 = Date.parse("2026-11-01T10:20:00Z");
const H = 3600_000;
const D = 24 * H;

const asset = (id: number, name: string, n: number) => ({ id, name, download_count: n });
const release = (id: number, tag: string, published: string, assets: ReturnType<typeof asset>[]): GhRelease =>
  ({ id, tag_name: tag, name: `PhotoCraft ${tag}`, draft: false, prerelease: false, published_at: published, assets });
const setup = () => {
  const db = connect(":memory:");
  db.exec("INSERT INTO repos (name, visibility) VALUES ('photocraft', 'public'); INSERT OR IGNORE INTO tracked_repos (name) VALUES ('photocraft')");
  let data: RepoReleases = { stars: 10, releases: [] };
  const poll = (now: number) => pollReleases(db, async (_o, repo) => (repo === "photocraft" ? data : { stars: 0, releases: [] }), now, (l) => { if (!l.includes("repos read")) throw new Error(l); });
  return { db, poll, set: (d: RepoReleases) => { data = d; } };
};
const dl = (db: ReturnType<typeof connect>, range: Parameters<typeof downloadsReport>[2], now: number) => downloadsReport(db, ["photocraft"], range, null, now);

test("the first poll is a baseline, later increases and new assets are recorded, and old hour buckets fold into days", async () => {
  const { db, poll, set } = setup();
  const r1 = release(1, "v1.0.0", "2026-10-01T00:00:00Z", [asset(11, "photocraft-1.0.0-windows-x64.msi", 100), asset(12, "photocraft-1.0.0-linux-x86_64.deb", 50), asset(13, "SHA256SUMS.txt", 9)]);
  set({ stars: 10, releases: [r1] });
  await poll(T0);
  let r = dl(db, "all", T0);
  assert.equal(r.totals.downloads, 150, "the running counts are the all-time total; checksums are not counted");
  assert.equal(dl(db, "today", T0 + H).totals.downloads, 0, "the baseline records no increase");
  assert.equal(r.historyFrom, "2026-11-01T10:20:00Z");

  // Two hours later: 7 more of one asset, and a new release whose whole count is new.
  r1.assets[0]!.download_count = 107;
  const r2 = release(2, "v1.1.0", "2026-11-01T11:00:00Z", [asset(21, "photocraft-1.1.0-windows-x64.msi", 4), asset(22, "photocraft-1.1.0-macos-universal.dmg", 3)]);
  set({ stars: 12, releases: [r1, r2] });
  const t1 = T0 + 2 * H;
  await poll(t1);
  r = dl(db, "today", t1);
  assert.equal(r.totals.downloads, 14);
  assert.equal(r.totals.stars, 2);
  assert.deepEqual(r.platforms.map((b) => [b.key, b.count]), [["windows", 11], ["macos", 3]]);
  assert.deepEqual(r.versions.map((b) => [b.label, b.count]), [["PhotoCraft v1.1.0", 7], ["PhotoCraft v1.0.0", 7]]);
  assert.equal(dl(db, "today", t1).versions.length, 2);
  assert.equal(dl(db, "1h", t1).totals.downloads, 14, "the current hour holds both increases");
  assert.equal(dl(db, "1h", t1 + 3 * H).totals.downloads, 0);
  assert.equal(dl(db, "all", t1).totals.downloads, 164);

  // Same count again records nothing; a drop (asset replaced) does not go negative.
  r1.assets[1]!.download_count = 40;
  await poll(t1 + 20 * 60_000);
  assert.equal(dl(db, "today", t1 + 20 * 60_000).totals.downloads, 14);

  // 20 days later the hour buckets of day one are day buckets; the day totals stay.
  const late = T0 + 20 * D;
  await poll(late);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM download_deltas WHERE span = 'h'").get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM download_deltas WHERE span = 'd'").get() as { n: number }).n, 3);
  assert.equal(dl(db, "30d", late).totals.downloads, 14);
  assert.equal(dl(db, "7d", late).totals.downloads, 0);
});

test("range sums count issues, merged PRs and release health from the mirror", async () => {
  const { db, poll, set } = setup();
  const now = Date.parse("2026-11-09T12:00:00Z");
  const a = release(1, "v1.0.0", "2026-10-01T00:00:00Z", [asset(11, "photocraft-1.0.0-linux-x86_64.deb", 0)]);
  set({ stars: 5, releases: [a] });
  await poll(now - 9 * H);
  const b = release(2, "v1.1.0", "2026-11-08T00:00:00Z", [asset(21, "photocraft-1.1.0-linux-x86_64.deb", 2000)]);
  set({ stars: 5, releases: [a, b] });
  await poll(now - 5 * H);
  const ins = db.prepare("INSERT INTO items (repo, number, kind, state, title, author, created_at, closed_at, merged_at) VALUES ('photocraft', ?, ?, ?, 't', 'u', ?, ?, ?)");
  ins.run(1, "issue", "OPEN", "2026-11-05T00:00:00Z", null, null);   // while v1.0.0 was newest
  ins.run(2, "issue", "CLOSED", "2026-11-08T05:00:00Z", "2026-11-09T01:00:00Z", null);   // while v1.1.0 was newest
  ins.run(3, "issue", "OPEN", "2026-11-09T02:00:00Z", null, null);
  ins.run(4, "pr", "MERGED", "2026-11-09T00:00:00Z", "2026-11-09T03:00:00Z", "2026-11-09T03:00:00Z");
  const t = dl(db, "today", now);
  assert.deepEqual([t.totals.downloads, t.totals.issuesOpened, t.totals.issuesClosed, t.totals.prsMerged], [2000, 1, 1, 1]);
  assert.equal(t.totals.issuesPer1k, 0.5);
  const all = dl(db, "all", now);
  assert.equal(all.totals.issuesOpened, 3);
  const [newer, older] = all.releases;
  assert.deepEqual([newer!.tag, newer!.latest, newer!.issues, newer!.per1k], ["v1.1.0", true, 2, 1]);
  assert.deepEqual([older!.tag, older!.latest, older!.issues, older!.per1k], ["v1.0.0", false, 1, null]);
  assert.equal(downloadsReport(db, [], "all", null, now).totals.downloads, 0, "repos the requester cannot see are left out");
});

test("an asset GitHub stops listing keeps its history and resumes from its stored count when it returns", async () => {
  const { db, poll, set } = setup();
  const a = asset(11, "photocraft-1.0.0-windows-x64.msi", 100);
  const r1 = release(1, "v1.0.0", "2026-10-01T00:00:00Z", [a]);
  set({ stars: 1, releases: [r1] });
  await poll(T0);
  a.download_count = 110;
  await poll(T0 + H);
  r1.assets = [];
  await poll(T0 + 2 * H);
  assert.equal(dl(db, "all", T0 + 2 * H).totals.downloads, 0, "all matches what GitHub lists");
  assert.equal(dl(db, "today", T0 + 2 * H).totals.downloads, 10, "ranges keep the history of a gone asset");
  r1.assets = [{ ...a, download_count: 115 }];
  await poll(T0 + 3 * H);
  assert.equal(dl(db, "all", T0 + 3 * H).totals.downloads, 115);
  assert.equal(dl(db, "today", T0 + 3 * H).totals.downloads, 15, "only the increase since the stored count is added");
  assert.equal((db.prepare("SELECT gone_at FROM release_assets WHERE asset_id = 11").get() as { gone_at: string | null }).gone_at, null);
});

test("a poll with no new counts does not move the settings topic the planner listens to", async () => {
  const { db, poll, set } = setup();
  set({ stars: 1, releases: [release(1, "v1.0.0", "2026-10-01T00:00:00Z", [asset(11, "photocraft-1.0.0-windows-x64.msi", 5)])] });
  await poll(T0);
  const before = readSeqs(db);
  await poll(T0 + 20 * 60_000);
  const after = readSeqs(db);
  assert.equal(after.settings, before.settings);
  assert.equal(after.steps, before.steps);
});
