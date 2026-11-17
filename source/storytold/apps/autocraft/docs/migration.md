# Moving a systemd install to a container

This runbook moves a running systemd install (see Production install in [operations.md](operations.md)) to the container image (see Running in a container). It was rehearsed with rootless Docker on a copy of a production database, with the network disabled and the pipeline off.

Placeholders: `<root>` is the systemd install root, `IMAGE` the image, `DATA` and `CONFIG` the volumes mounted at `/data` and `/config`. The `docker run` lines show the shared options as `$RUN`:

```
RUN="-v DATA:/data -v CONFIG:/config --env-file container.env"
```

`container.env` holds `AUTOCRAFT_BASE_URL`, `AUTOCRAFT_TRUST_PROXY` and any other setting from the systemd settings file that is not a path. Do not copy the path settings (`AUTOCRAFT_DB`, `AUTOCRAFT_SECRETS_FILE`, cache and lock directories, listen addresses): the image sets them. Go through the old settings file line by line:

| Old setting | In the container |
|---|---|
| `AUTOCRAFT_BASE_URL`, `AUTOCRAFT_TRUST_PROXY`, `AUTOCRAFT_REVIEW_BOTS`, `AUTOCRAFT_STOP_TIMEOUT` | Copy to `container.env`. |
| `AUTOCRAFT_DISCORD_TOKEN_FILE`, `AUTOCRAFT_DISCORD_KEY_FILE`, `AUTOCRAFT_IMAGE_TOKEN_FILE` | Each names a file. Copy the file to `/config` (step 6) and set the variable to the new path. |
| `AUTOCRAFT_ARTIFACT_DIR`, `AUTOCRAFT_SNAPSHOT_DIR` | Leave unset: the code then uses `artifacts` and `item-snapshot` beside the database, in `/data` (step 5). |
| `AUTOCRAFT_MERGE_CMD`, `AUTOCRAFT_EXTRA_STEPS` | Name a program or module of the old host. The image has neither; leave them unset unless a derived image adds it. |
| `AUTOCRAFT_WORKER_SSH`, `AUTOCRAFT_BRANCH`, `AUTOCRAFT_ROOT`, `AUTOCRAFT_UNITS`, `AUTOCRAFT_RUNNER_UNIT`, `AUTOCRAFT_TIMER`, `AUTOCRAFT_SUDO`, `AUTOCRAFT_HEALTH_URL`, `AUTOCRAFT_ENV_FILE`, `AUTOCRAFT_KEEP_RELEASES` | Drop. Only `deploy/hook.sh` reads them; it runs `autocraft worker update-code`, which needs `ssh` and a bare repository, and the image has neither. Update a worker's code by hand (see Build worker in the VPS section). |

Also check the old `PATH` for wrappers (for example a `gh` wrapper that picks an account by directory): the image has the plain `gh`, which uses the one `GH_TOKEN`.

Steps marked **admin** need a person with access to the secrets or to DNS and the proxy.

## Before the window

1. **admin**: Build or pull the image and start it once with `--network none` against an empty volume to check that it runs (`IMAGE pipeline status`).
2. **admin**: Decide where the dashboard is reachable and keep the DNS and reverse-proxy change ready. `AUTOCRAFT_BASE_URL` must be the public origin; the GitHub App's callback and setup URLs and the OAuth app's callback URL must match it (see Moving to a new domain in [deploy-checklist.md](deploy-checklist.md)).
3. Check the free space of the target volume: the database plus its newest backup (a 1.2 GB database restored in under 10 s).
4. **admin**: Size the VPS disk. Plan for 20 GB or more (today's figures):

   | Part | Size |
   |---|---|
   | Database | 1.5 GB |
   | `reference/` | 1.5 GB (twice while an import runs) |
   | Item snapshot | 0.9 GB |
   | 7 daily backups | about 3.5 GB |
   | Checkouts (regrow after the move) | about 8 GB |
   | Fixup git cache (regrows) | about 3 GB |
   | Image, Docker layers and logs | a few GB |

## Cut-over

1. **Pipeline off.** On the old host: `autocraft pipeline off`. Wait until the runner has no running job (`autocraft pipeline status`, or the jobs list on the dashboard). `pipeline off` holds only automatic jobs: jobs queued by a user or the CLI stay queued and would start on the new runner. List them with `autocraft runner jobs --state queued` and cancel each with `autocraft runner cancel <id>`. Check that the list is empty before the final backup. Also check that `worker_update_pending` is not set: `autocraft worker status` lists a pending update. A pending update makes the runner call `ssh`, which the image does not have (`src/build/worker-update.ts:119-142`); finish it on the old host first.
2. **Final backup.** `deploy/backup.sh predeploy` (with the systemd settings loaded). It writes `<database dir>/backups/predeploy-<UTC time>.db.zst` from a consistent snapshot and checks its integrity. Keep the file name.
3. **Stop the old services**: the runner, the dashboard, the sync and backup timers. Nothing may write to the old database from now on. Do not delete anything on the old host.
4. **Create the volumes** and make `/data` and `/config` writable by uid 10001. With Docker, named volumes take that ownership from the image. In Kubernetes, `fsGroup: 10001` does it.
5. **Restore the database** into the data volume. Stream the backup through a container so no host permissions are involved (the volume belongs to uid 10001, and under rootless Docker the host cannot read it):

   ```
   zstd -dc predeploy-<time>.db.zst | docker run -i --rm -v DATA:/data --entrypoint sh IMAGE -c 'rm -f /data/mirror.db-wal /data/mirror.db-shm; cat > /data/mirror.db'
   docker run --rm -v DATA:/data --entrypoint sqlite3 IMAGE /data/mirror.db 'PRAGMA quick_check'
   ```

   Expect `ok`. Restore only the `.db` file; never copy `-wal` or `-shm` files from the old host. On a volume that held a database before, the restore command deletes stale `-wal` and `-shm` files first.

   The database directory (`<root>/data`) holds more than `mirror.db`. The container finds each of these beside the database in `/data`, with no setting:

   | Path | Verdict | Evidence |
   |---|---|---|
   | `reference/<repo>/` (private reference pages, about 1.5 GB) | **Carry over.** It is not rebuildable from GitHub; without it the calls that judge reference-app behaviour run without `/reference`. | `src/reference.ts:22-33`, `src/review/opus.ts:256` |
   | `item-snapshot/items.db` (about 0.9 GB) | **Drop.** It is built from the database. The first sync after start creates it (`rebuilt`); the dashboard and a pipeline-off runner do not need it. Check that it exists before the pipeline goes on (step 9). | `src/itemtools/snapshot.ts:94-110`, `src/mirror.ts:895` |
   | `artifacts/` (task output) | **Optional.** Rows in `build_artifacts` point to these files. A missing file makes the artifact download answer 404 ("the artifact file is gone"). Tasks older than 30 days lose their artifacts anyway. Copy it only to keep recent downloads. | `src/dash/api/build.ts:77-82`, `src/build/tasks.ts:23` |
   | `backups/` | **Optional.** Keep the old files off the box as history; the container writes new ones to `/data/backups`. | `deploy/backup.sh` |
   | `<root>/cache/autocraft/jobs/` (job logs) | **Carry over.** `jobs.log_path` stores the absolute old path, and the job page shows the log from it. Copy the files and rewrite the paths (below). | `src/runner/cli-job.ts:78-80`, `src/runner/jobs.ts:182-214` |
   | Rest of `<root>/cache/` (embedding model, diffs, checkouts, fixup git cache, usage readings) | **Drop.** The model (34 MB) downloads on first use, a missing diff is read from GitHub again, checkouts and the fixup cache are cloned again (they regrow to several GB), usage readings are written again. | `src/review/diff.ts:36-45`, `src/embed/model.ts:48` |

   Stream the reference pages per repository (the import checks the files, needs the repository to be tracked, which the restored database provides, and records `reference-import` in the audit log):

   ```
   tar -cf - -C <root>/data/reference/<repo> . | docker run -i --rm -v DATA:/data IMAGE reference import <repo>
   docker run --rm -v DATA:/data IMAGE reference list
   ```

   The file counts and sizes must equal the old host's `autocraft reference list`. To copy `artifacts/` as it is:

   ```
   tar -cf - -C <root>/data artifacts | docker run -i --rm -v DATA:/data --entrypoint tar IMAGE -xf - -C /data
   ```

   Copy the job logs to the image's log directory (`AUTOCRAFT_RUNNER_LOGS`, `/data/cache/autocraft/jobs`), then point the rows at it, before the first start. `<old jobs dir>` is the old `AUTOCRAFT_RUNNER_LOGS`:

   ```
   tar -cf - -C <old jobs dir> . | docker run -i --rm -v DATA:/data --entrypoint sh IMAGE -c 'mkdir -p /data/cache/autocraft/jobs && tar -xf - -C /data/cache/autocraft/jobs'
   docker run --rm -v DATA:/data --entrypoint sqlite3 IMAGE /data/mirror.db "UPDATE jobs SET log_path = replace(log_path, '<old jobs dir>', '/data/cache/autocraft/jobs') WHERE log_path LIKE '<old jobs dir>/%'"
   ```
6. **Place the secrets. admin.** Create `/config/secrets.json` with mode 0600, owner uid 10001, with the old file's content. Keep `session_key` byte for byte: the dashboard seals each user's GitHub tokens with it, and with a different key every sealed token reads as unavailable until the user signs in again. The GitHub client and App keys come from the same file. Never put the file in an image, a manifest or a log.

   ```
   docker run -i --rm -v CONFIG:/config --entrypoint sh IMAGE -c 'umask 077; cat > /config/secrets.json' < secrets.json
   ```

   The dashboard refuses to start if the file is readable by group or others.

   `secrets.json` also holds the GitHub App's keys, including `github_app_webhook_secret`, the secret that GitHub signs webhook deliveries with (`src/dash/server/config.ts:103-108`). Nothing else stores it, so the webhook keeps working with the same URL. The dashboard reads it at start.

   **Other secret files.** Each is read by path from an environment variable, refused when group or others can read it (`src/discord/keys.ts:62-67`), and must be placed in `/config` with mode 0600, owner uid 10001:

   | Old file | New path and setting | Notes |
   |---|---|---|
   | `AUTOCRAFT_DISCORD_TOKEN_FILE` | `/config/discord-token`, same variable | Needed on the runner (it runs the gateway). |
   | `AUTOCRAFT_DISCORD_KEY_FILE` | `/config/discord-key`, same variable | **Byte for byte.** Stored message references are sealed with a key derived from it (`src/discord/keys.ts:13-16`); a different key makes every stored reference unreadable, and the deletion lookups stop matching. Set it on the dashboard and the runner (the dashboard builds message links with it). |
   | `AUTOCRAFT_IMAGE_TOKEN_FILE` (if set) | `/config/image-token`, same variable | Without it the image proxy uses `GH_TOKEN`. |

   ```
   docker run -i --rm -v CONFIG:/config --entrypoint sh IMAGE -c 'umask 077; cat > /config/discord-key' < <old key file>
   sha256sum <old key file>; docker run --rm -v CONFIG:/config --entrypoint sha256sum IMAGE /config/discord-key
   ```

   The two hashes must match. The watched channels and Discord status are in the database and carry over with it.
7. **Place the accounts. admin.** Accounts come from two places (`src/agents/box.ts`): the entries of `accounts.json`, each with an absolute `configDir` of the old host, and the accounts added on the Accounts page, whose directories are `<accounts root>/<id>` (`/config/claude` in the image, from `AUTOCRAFT_ACCOUNTS_ROOT`). Copy every directory, owned by uid 10001, keeping the modes (credentials are 0600), and rewrite `accounts.json` so that no `configDir` names an old path:

   1. Accounts of the file: copy each account's directory to `/config/accounts/<id>`, by id, and write `accounts.json` with that path as its `configDir`. `/config/accounts` is not under the accounts root, so the two groups cannot collide:

      ```
      jq -r '.[] | "\(.id) \(.configDir)"' accounts.json | while read -r id dir; do
        tar -C "$dir" -cf - . | docker run -i --rm -v CONFIG:/config --entrypoint sh IMAGE -c "mkdir -p /config/accounts/$id && tar -C /config/accounts/$id -xpf -"
      done
      jq 'map(.configDir = "/config/accounts/" + .id)' accounts.json | docker run -i --rm -v CONFIG:/config --entrypoint sh IMAGE -c 'umask 077; cat > /config/accounts.json'
      ```
   2. Accounts added on the Accounts page: copy the old accounts root (`<root>/config/claude`, one subdirectory per id; the code finds each at `<accounts root>/<id>`) to `/config/claude`:

      ```
      tar -C <root>/config/claude -cf - . | docker run -i --rm -v CONFIG:/config --entrypoint sh IMAGE -c 'mkdir -p /config/claude && tar -C /config/claude -xpf -'
      ```
   3. Each directory carries its login (`.credentials.json`) and, if the operator set one, its long-lived token (`oauth-token`). Usage readings and sign-in state are read again by the app. Look for absolute host paths in each directory's `settings.json` and remove them.

   The systemd install used a logged-in `gh`; the container uses a token instead. The admin creates a GitHub token for `gh` (classic personal access token with the `repo`, `read:org` and `workflow` scopes; keep `workflow`, which lets the pipeline push to branches that change workflow files) and sets it as `GH_TOKEN` for the dashboard, the runner and the sync and backup containers (with Docker, `GH_TOKEN=...` in a `container.env` file of mode 0600 passed with `--env-file`; in Kubernetes, the Secret `autocraft-github`). The dashboard needs it for the image proxy and for adding a repository. If a login does not carry over, sign in again with the account's Claude CLI inside the container.
8. **Disable the old local build environments**, then **start the dashboard** and the runner (the runner needs the sandbox options from Sandbox (bubblewrap) in operations.md). The restored database still lists the old host's `local-sandbox` environments as enabled, and nothing in the new install connects as one, so their `worker:<id>` health checks would fail and `GET /healthz/checks` would answer 503. Disable each environment that `IMAGE envs list` shows before the first start: `docker run --rm $RUN IMAGE envs set <id> --enabled no`. Afterwards the checks expect no worker failure from them (a build worker you register later adds its own check). Both processes start with the pipeline off, because the restored database says so:

   ```
   docker run -d --name autocraft-dashboard $RUN -p 3005:3005 IMAGE dashboard
   docker run -d --name autocraft-runner $RUN --stop-timeout 30 \
     --security-opt seccomp=unconfined --security-opt systempaths=unconfined IMAGE runner
   ```

   Start the sync and backup schedules last (`IMAGE sync` every minute, `IMAGE backup daily 7` daily, or the `periodic` container of the Kubernetes manifest).
9. **Check**, with the pipeline still off:
   - `GET /healthz` and `/readyz` answer 200 on the dashboard (3005) and on the runner's worker API (8981).
   - The logs show `dashboard listening` and `runner: started on N steps`.
   - `IMAGE repos list` shows the same repositories with the same open and mirrored counts as on the old host (the old host's last sync time can differ by up to a minute).
   - `IMAGE pipeline status` prints `pipeline OFF`.
   - The runner started no job: the highest job id does not change.
   - `bwrap --unshare-all --ro-bind / / --proc /proc --dev /dev true` exits 0 inside the runner container (`docker exec autocraft-runner bwrap ...`). If it fails on rootful Docker with an AppArmor profile that restricts user namespaces, add `--security-opt apparmor=unconfined` to the runner next.
   - **admin**: open the Accounts page after signing in. Each account shows its state and usage. Do the same check on the old host's Accounts page before step 11 (see Rollback).
   - `IMAGE backup daily 7` (with `$RUN`) writes a snapshot to `/data/backups`: the schedule of the periodic container then counts from it. `ls /data/item-snapshot/items.db` exists once the first sync has finished.
10. **Switch the traffic. admin.** Point DNS or the proxy at the new dashboard. If the origin changed, update the GitHub App's callback and setup URLs and the OAuth app's callback URL (Moving to a new domain in [deploy-checklist.md](deploy-checklist.md)). Point the workers at the new runner's worker API (see Running a worker); keep that port off the public network.
11. **Pipeline on.** `docker exec autocraft-runner node --no-warnings src/cli.ts pipeline on`, or `docker run --rm $RUN IMAGE pipeline on` (the database is shared through the volume). Watch the first jobs finish on the dashboard.

## Rollback

Do this if a check in step 9 or the first jobs after step 11 fail.

1. Pipeline off on the new instance, then stop and keep (do not remove) its containers and volumes: the new instance stays off from now on, so only one runner ever writes a database.
2. Point DNS and the proxy back, and revert the OAuth app's callback URL and, if you changed them, the GitHub App's callback and setup URLs to the old origin.
3. Start the old services on the old database: the dashboard, then the runner, then the timers. The old database is the state of step 2; the new instance's changes since then are not carried back. Users whose GitHub tokens were refreshed on the new instance sign in again, and so do Claude accounts without a long-lived `oauth-token` (a refreshed login on the new instance can invalidate the old one). Check the Accounts page on the old host before turning the pipeline on. If the pipeline made changes on GitHub in between, the next sync reads them.
4. `autocraft pipeline on` on the old host when the checks pass there.

A second attempt starts from the cut-over again with a fresh final backup (the old host's pipeline off, the new volumes emptied).

## Rehearsal results

Rehearsed with rootless Docker on a copy of the newest production snapshot (1.2 GB database, 500 MB compressed), `--network none`, a placeholder `secrets.json` with a generated `session_key` and no Claude or GitHub logins.

| Step | Result |
|---|---|
| Decompress and restore into the volume | 8.8 s |
| Integrity check of the restored file | `ok`, journal mode `wal` |
| Dashboard start to `/readyz` 200 | 1.5 s |
| Runner start to `/readyz` 200 | 1.0 s |
| `repos list` | all repositories, counts equal to the snapshot |
| `pipeline status` | `OFF` |
| Runner with the pipeline off | one planner pass of about 4 s at start, then idle (a wake time that had passed no longer repeats the pass); no job is queued or started |
| `backup predeploy` in the container | 12.7 s, snapshot written to `/data/backups` |
| Runner stop (SIGTERM) | under 1 s; the flowchart summary's duplicate-pairs query uses the pairs index first, so no helper thread sits in a long statement. If a stop still exceeds `AUTOCRAFT_STOP_TIMEOUT` the runner kills itself. The next start worked every time (stale lock recognised, no recovery needed with no job running). The dashboard stops in under 0.1 s. |
| Sealed GitHub tokens read with another `session_key` | `null` (unavailable), no error |

Not covered: the Accounts page (it needs a signed-in session and the GitHub App), Claude and GitHub calls, and a runner with a running job.

## Kubernetes variant

A StatefulSet pod holds the ReadWriteOnce claims, so nothing else can mount them while it runs. Place the data and secrets before the first start:

1. Set `replicas: 0` in `deploy/k8s/autocraft.yaml` and apply it. The claims `data-autocraft-0` and `config-autocraft-0` exist and no pod runs.
2. Start a helper pod that mounts both claims (uid 10001, `fsGroup` 10001, the same image, `command: [sleep, 3600]`). Do cut-over steps 5 to 7 in it with `kubectl exec -i` and `kubectl cp`: restore the database (including the deletion of stale `-wal` and `-shm` files), then place `secrets.json` (mode 0600), `accounts.json` and the Claude directories.
3. Delete the helper pod and wait until it is gone.
4. Create the Secret `autocraft-github` (key `token`), then scale up: `kubectl scale statefulset autocraft --replicas=1`.

## VPS with Docker Compose

`deploy/compose/compose.yaml` runs the dashboard, the runner and the `periodic` container (sync every minute, `backup daily 7` daily, the loop of the Kubernetes manifest) on one host. Copy `deploy/compose/container.env.example` to `container.env` next to it (mode 0600) and fill it in. `GH_TOKEN` and the settings of the table in the introduction go there; the file is read by all three services. `AUTOCRAFT_IMAGE` (shell or `.env`) names the image; the default is the local `autocraft`.

| Item | Value |
|---|---|
| Volumes | `autocraft-data` (`DATA`) and `autocraft-config` (`CONFIG`) |
| Dashboard | published on `127.0.0.1:3005` only |
| Worker API | 8981, not published (see Build workers) |
| Restart | `unless-stopped`; the runner has `stop_grace_period: 30s` (it must exceed `AUTOCRAFT_STOP_TIMEOUT`, default 25 s), `seccomp=unconfined` and `systempaths=unconfined`, and drops all capabilities |
| Logs | `docker compose logs`; Docker keeps 5 files of 10 MB per service |

The cut-over steps above apply unchanged, with these commands:

| Step | Compose |
|---|---|
| 4. Create the volumes | `docker compose up --no-start` (creates the volumes with the image's ownership, starts nothing) |
| 5 to 7. Restore and place files | The `docker run` commands with `DATA=autocraft-data`, `CONFIG=autocraft-config` and `IMAGE` the image |
| 8. Start | `docker compose up -d dashboard runner`, then `docker compose up -d periodic` |
| 9. Check | `docker compose ps` (both services `healthy`); `docker compose run --rm --no-deps dashboard repos list` and `... pipeline status`; `docker compose exec runner bwrap --unshare-all --ro-bind / / --proc /proc --dev /dev true` (exit 0; on rootful Docker with an AppArmor user-namespace restriction add `apparmor=unconfined` to the runner); `docker compose run --rm --no-deps dashboard backup daily 7` |
| 11. Pipeline on | `docker compose exec runner node --no-warnings src/cli.ts pipeline on` |
| Rollback | `docker compose stop`; keep the volumes |

After a reboot Docker starts the services again; the pipeline state is in the database. Update by pulling or building the new image and running `docker compose up -d`; the runner stops its jobs first (see Stopping in [operations.md](operations.md)).

### Reverse proxy and DNS

Any TLS reverse proxy on the VPS forwards the public origin to `127.0.0.1:3005`. It must:

- pass `Host` and set `X-Forwarded-For` (with `AUTOCRAFT_TRUST_PROXY=1` the dashboard reads the last entry);
- not buffer or time out `GET /api/live` early (an event stream that stays open);
- accept request bodies of at least 1 MB (`POST /webhooks/github` allows 1 MB);
- route nothing to 8981.

A Caddy site that meets this:

```
autocraft.example.com {
	reverse_proxy 127.0.0.1:3005 {
		flush_interval -1
	}
}
```

With nginx, set `proxy_buffering off` and a long `proxy_read_timeout` for `/api/live`.

Cut the traffic over by changing the DNS record of the origin to the VPS (lower its TTL a day ahead). When the origin stays the same, nothing registered with GitHub changes: the GitHub App's callback, setup and webhook URLs and the OAuth app's callback URL all derive from `AUTOCRAFT_BASE_URL`, and sessions (stored in the database) stay valid because the cookie belongs to the same host. Deliveries sent while DNS still points at the old host reach it, not the new one; the minute poll covers them. If the origin changes, follow Moving to a new domain in [deploy-checklist.md](deploy-checklist.md).

### Build workers

Untrusted pull request builds never run on the VPS: it has no worker. A worker runs on a separate build box (location open) and connects to the runner's worker API.

1. **Route to 8981.** The worker must reach the runner on 8981, and nothing else may. Use a TLS proxy on the VPS for a separate hostname (not the dashboard's site), forwarding to `127.0.0.1:8981` (uncomment the loopback line in `compose.yaml`) and accepting only the build box's address (`remote_ip` matcher in Caddy, `allow` and `deny all` in nginx, or a firewall rule on the port). `coordinatorUrl` is `https://worker-api.example.com`.

   The worker key authenticates every call after the address check; it does not replace it.
2. **Register the environment**, once, and put its key on the build box:

   ```
   docker compose exec -T runner node --no-warnings src/cli.ts envs add build1 --label "Build box" --kind remote --slots 2 --print | head -n 1 | ssh build-box 'umask 077; mkdir -p ~/.config/craft-worker; cat > ~/.config/craft-worker/key'
   ```

   The key is shown once; `envs rotate-key build1 --print` issues a new one. The Build environments page does the same. The environment row is in the database, so a migrated install keeps its registered environments; place the old keys on the build box again if the old worker moves, or rotate.
3. **Configure the worker** (see Running a worker in [operations.md](operations.md)): `coordinatorUrl` from step 1, `keyFile` and `workDir` on the build box, rootless Podman for the steps. Run it as a user service from a checkout of this repository at the commit of the image (`SOURCE_COMMIT`). A new image needs a new checkout and a worker restart; the image cannot update the worker, because it has no `ssh` client.

**Without a connected worker** the pipeline keeps running. Build tasks stay `queued` (up to 500; the enqueue is refused above that). What waits:

| Work | Effect |
|---|---|
| Verify for a PR whose repo has no upstream CI, or a bugfix that changes a test | The verification stays "Planned" (tasks queued for a worker). Repos whose upstream CI is enough are not affected. |
| Fix-up and CI fix lint tasks | The patch waits for its lint task; there is no queue timeout. |
| Check tool inside a Claude call | The check waits up to the 45-minute cap on all check time of the call, then the call gets "no worker had taken it (still queued)". |
| Security fix builds | Wait up to 4 hours, then the tasks are cancelled and the round counts as failed. |

It shows as: the warning `Build worker <label> has not reported for N min` (a `fail` check `worker:<id>`) once the worker has been silent for 5 minutes; `N build tasks have waited over 10 minutes for a worker` (`build-queue`, `fail` when no enabled environment is up) on the dashboard's warnings menu and in `GET /healthz/checks` (503); and the Build environments page, where the environment is offline. A worker that returns claims the queue in priority order; tasks it held when it went silent are requeued once.

### `jev`

The image has no `jev`. The runner notices (`jevInstalled`), records the outage `not installed` (shown on the Accounts page) and tests the PATH again on each pass. Meanwhile Haiku does Jev's work: the classify, priority and duplicate-pair steps, the semantic reference check of replies and the Discord signal check decide with Haiku alone (`src/agents/jev.ts`, `src/reference-lint.ts:127`, `src/discord/signals.ts:159`). That costs Claude account usage that Jev calls would not, and decisions lose Jev's first pass; a derived image that puts `jev` on the PATH restores it. Nothing fails.

### Off-box backup copy

The `periodic` container keeps 7 daily snapshots in the `autocraft-data` volume (`/data/backups`), the same disk as the database. Copy them off the VPS daily, to storage the VPS cannot overwrite. For example, from a machine that holds the destination credentials:

```
ssh vps 'docker run --rm -v autocraft-data:/data --entrypoint sh IMAGE -c "cat \$(ls -1t /data/backups/daily-*.db.zst | head -n 1)"' > daily-latest.db.zst
```

Also keep a copy of `autocraft-config` (`secrets.json`, `accounts.json`, the Claude directories, the Discord files): the database alone cannot sign anyone in. Archive it with `docker run --rm -v autocraft-config:/config --entrypoint tar IMAGE -cf - -C /config .` and encrypt the archive before it leaves the VPS. Test a restore (steps 5 and 6) on another machine.
