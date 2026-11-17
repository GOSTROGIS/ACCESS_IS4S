# Deployment checklist

For the admin who sets up AutoCraft on a cluster or a VM. Reference detail is in [operations.md](operations.md), "Running in a container". The steps to move an existing installation (database, secrets, accounts) are in the migration runbook, [migration.md](migration.md).

## Image

Build and push from a checkout, on any machine with Docker or Podman. No CI is involved.

```
AUTOCRAFT_REGISTRY=registry.example.com/team/autocraft deploy/container/build-push.sh
deploy/container/build-push.sh --no-push     # build only; local name autocraft
```

- The script refuses a working tree with uncommitted or untracked changes, tags the image with the 12-character commit id and `latest`, and pushes both tags. `DOCKER_HOST` is honoured. Extra build arguments go in `BUILD_ARGS`, for example `BUILD_ARGS="--build-arg CLAUDE_CODE_VERSION=2.1.309"`.
- Contents: Docker Hardened Images for Node 26 on Debian 13 (the shell-less runtime variant; the build stages use the dev variant), `git`, `bubblewrap`, `sqlite3`, `curl`, `zstd`, `tini`, `bash`, `dash` (`/bin/sh`), coreutils, grep, sed, tar, gzip, findutils, `script`, `pnpm`, `gh` (pinned by checksum), the Claude CLI (pinned, auto-update off), the production dependencies and the built dashboard. It runs as uid 10001 and declares the volumes `/data` and `/config`.
- Not in the image: `jev` (Haiku does Jev's work while it is missing; a derived image restores it) and the sandbox build workers.
- One image serves every process. The first argument picks it: `dashboard` (default), `runner`, `sync`, `backup`, or any `autocraft` subcommand.

## VPS with Docker Compose

On one VPS, `deploy/compose/compose.yaml` runs the same three processes (dashboard, runner, periodic) with named volumes `autocraft-data` and `autocraft-config`; the settings go in `container.env` (`deploy/compose/container.env.example`). The runbook is the "VPS with Docker Compose" section of [migration.md](migration.md). In short:

- **Proxy.** Any TLS reverse proxy on the VPS forwards the origin to `127.0.0.1:3005`, the only published port. It must pass `Host`, set `X-Forwarded-For` and not buffer `GET /api/live`.
- **DNS.** Point the origin's record at the VPS. If the origin stays the same, the GitHub App's callback, setup and webhook URLs and the OAuth callback URL stay as they are.
- **Build workers.** None on the VPS. A separate build box reaches the worker API (8981) through a TLS proxy on its own hostname that accepts only its address, never through the dashboard's site. Register it with `autocraft envs add <id> --label TEXT --kind remote --slots N --print` (the full command with the key handling is under "Build workers" in the migration runbook). Disable the old install's `local-sandbox` environments (`envs set <id> --enabled no`), or their health checks fail.
- **`jev`.** Not in the image. Haiku does the classify, priority, duplicate and signal work through the Claude accounts until a derived image adds it.
- **Backups.** The daily snapshot sits on the VPS disk. Copy it, and `/config`, off the VPS on a schedule.

## Processes

| Process | Command | What it does |
|---|---|---|
| Dashboard | `dashboard` | Serves the web app and the API over plain HTTP on 3005. Handles GitHub sign-in, the access list and the inbox MCP endpoint (`POST /mcp`). |
| Runner | `runner` | Runs the pipeline jobs, including the sandboxed Claude calls, and serves the worker API on 8981. |
| Periodic | `sync` every minute, `backup daily 7` once a day | Mirrors GitHub into the database; writes the daily database snapshot. `deploy/k8s/autocraft.yaml` runs both in one looping container. |

Run exactly one replica of the whole set, on one node. The database is SQLite on a ReadWriteOnce volume, so every process that opens it must share the node and the volume. The runner and sync use lock files that hold a process id; a second pod cannot see them, so two runners on one volume are not excluded. Use a StatefulSet with one replica, or a Deployment with `Recreate`. Do not use CronJobs for sync and backup: a CronJob pod can be scheduled on another node, where the volume cannot attach.

## Environment variables

The image sets every path (`/data/...`, `/config/...`). A deployment sets only these.

| Name | Required | Default | Purpose |
|---|---|---|---|
| `AUTOCRAFT_BASE_URL` | dashboard: yes | none | Public origin, `https://autocraft.example.com`, no path. Used for sign-in callbacks and links. |
| `AUTOCRAFT_TRUST_PROXY` | behind a proxy | off | `1` reads the client address from the last `X-Forwarded-For` entry, for rate limits. Set it only when the proxy sets that header. |
| `GH_TOKEN` | yes, on dashboard, runner and periodic | none | GitHub token for `gh` (the dashboard's image proxy and repository adds, sync, pipeline calls): a classic token with `repo`, `read:org` and `workflow` scopes. Keep it in a Secret. |
| `AUTOCRAFT_STOP_TIMEOUT` | no | `25` | Seconds the runner may take to stop. Keep the pod's `terminationGracePeriodSeconds` above it (30). |
| `AUTOCRAFT_HEALTH_LISTEN` | no | off | `host:port` of a runner listener that serves only `/healthz` and `/readyz`. |
| `AUTOCRAFT_NO_SANDBOX` | no | off | `1` runs without bubblewrap, so without tool mode. Use it only if the cluster cannot allow the runner settings below. |
| `AUTOCRAFT_REVIEW_BOTS` | no | `coderabbitai,dependabot,renovate` | Logins of review bots whose comments never make a review stale. Set it alike for dashboard, runner and periodic. |
| `AUTOCRAFT_GITHUB_APP_NAME` | no | `AutoCraft` | Name suggested on the GitHub App registration form. |
| `AUTOCRAFT_IMAGE_TOKEN_FILE` | no | `gh auth token` | File holding the token the dashboard's image proxy uses for GitHub images. |
| `AUTOCRAFT_DISCORD_TOKEN_FILE` | no | off | File holding a Discord bot token (mode 600). Setting it on the runner turns on Discord mention counting; it needs the key file too. |
| `AUTOCRAFT_DISCORD_KEY_FILE` | with the token file | none | File of at least 32 random characters (mode 600) that encrypts stored message references. Set it on the dashboard as well to show message links. |
| `AUTOCRAFT_MERGE_CMD` | no | built-in `safe-merge` | External merge command; it must accept `--head <sha>`. |
| `AUTOCRAFT_CALL_IDLE_MIN` | no | `15` | Minutes a model call may stay silent before it is stopped. |

Never set `AUTOCRAFT_DEV_AUTH`: it signs in as any login and is allowed only on a loopback address.

## Volumes

| Volume | Mount | Holds | Secrets |
|---|---|---|---|
| data (20 Gi in the manifest) | `/data` | `mirror.db` (SQLite), the git cache and checkouts, job logs, task artifacts, `HOME`, backups in `/data/backups` | The database holds encrypted GitHub user tokens, agent token hashes and sessions. Treat it, and its backups, as secret. |
| config (1 Gi) | `/config` | `secrets.json` (mode 0600, owner uid 10001), `accounts.json`, the Claude account directories in `/config/claude`, the `gh` config if `gh auth login` is used instead of `GH_TOKEN` (needed only while the GitHub identity is the box account; under the GitHub App identity every read and write uses installation tokens) | All of it. `secrets.json` holds the OAuth client secret, the session key and the GitHub App private key; the account directories hold Claude logins. |

Both are read-write: the dashboard rewrites `secrets.json` (a temporary file in `/config`, then a rename) when the GitHub App is registered, and writes account files, logins and usage readings. `session_key` seals the stored GitHub tokens (`user_tokens` and each session's token set). With a different key those read as unavailable until each user signs in again. Sessions and agent tokens do not depend on it.

## Ports and health checks

| Process | Port | `/healthz` | `/readyz` |
|---|---|---|---|
| Dashboard | 3005 | 200 while the process is up | 200 while the database answers a query, else 503 |
| Runner | 8981 (worker API) | same | same |

Both endpoints need no sign-in and return no data. `deploy/k8s/autocraft.yaml` probes the dashboard on 3005 and the runner on 8981. The periodic container has no endpoint; its output is on stdout.

## Monitoring

`GET /healthz/checks` on the dashboard port needs no sign-in. It answers 200 while every check is `ok` or `warn` and 503 when one is `fail`:

```json
{"status":"fail","checks":[{"id":"runner","state":"ok"},{"id":"workers","state":"fail"},{"id":"sync-repos","state":"warn"}]}
```

It lists check ids and states; build workers and repos are one entry each. A request with an operator's or maintainer's session also gets the time a check turned bad (`since`), counts (`count` bad of `of`) and the answer's time (`at`). It carries no repo, environment or account names and no error text. The answer is cached for 5 seconds. Point an external monitor at it and alert on a non-200 answer or on a `warn` that persists. The checks are described in `docs/operations.md` (Health checks).

## Runner security settings (bubblewrap)

Tool-using Claude calls run in `bwrap`. Under default container settings it fails: the default seccomp profile blocks the user namespace and the masked `/proc` paths block the `/proc` mount. On the runner container only (the dashboard and periodic containers keep the defaults), set:

- pod `hostUsers: false`
- container `securityContext.procMount: Unmasked`
- container `securityContext.seccompProfile.type: Unconfined`
- not privileged, no added capabilities (`drop: ["ALL"]`)

`procMount: Unmasked` works only on pods with `hostUsers: false` and on clusters that support it (a feature gate in older releases). These settings were tested with rootless Docker (`--security-opt seccomp=unconfined --security-opt systempaths=unconfined`) and not on a cluster. Test on the real cluster before relying on them: start the runner, then check inside its container that `bwrap --unshare-all --ro-bind / / true` and a Claude call succeed in the runner container. A profile that confines the container (for example AppArmor) and denies user namespaces may need to be relaxed as well. If the cluster refuses these settings, the fallback is `AUTOCRAFT_NO_SANDBOX=1`, which disables tool mode.

## Outside access

| Direction | Allow |
|---|---|
| Inbound | The dashboard (3005) over TLS, behind the ingress or proxy, at the public origin. Nothing else. |
| Inbound, only with separate build boxes | The worker API (8981), over TLS, reachable by those boxes only. Never through the public ingress. |
| Outbound | GitHub (`github.com`, `api.github.com`, and the hosts for repository and image downloads) and Anthropic (the Claude API). The first use of semantic search also downloads a 34 MB model from Hugging Face; allow it once or pre-seed the cache. |

The proxy must pass `Host`, set `X-Forwarded-For` when `AUTOCRAFT_TRUST_PROXY=1`, and not buffer or time out `GET /api/live` (an event stream) too early.

## Backups

The periodic container writes `daily-<timestamp>.db.zst` to `/data/backups` once a day and keeps 7. The snapshot is consistent while the services run and passes an integrity check. It sits on the same volume as the database, so it does not protect against losing the volume: copy the files off it on a schedule (a sidecar, a volume snapshot of `data`, or a job that mounts it on the same node). Also keep a copy of `secrets.json` and `accounts.json` and the Claude account directories somewhere safe; the database alone cannot sign anyone in or run a job.

To restore, stop the pod (or scale to 0) and stream the snapshot into the volume from a helper container: `zstd -dc daily-<time>.db.zst | <run in the image> sh -c 'rm -f /data/mirror.db-wal /data/mirror.db-shm; cat > /data/mirror.db'`. Then start it. The migration runbook ([migration.md](migration.md)) has the full commands.

## Moving to a new domain

Sign-in and the GitHub App are tied to the public origin. Do these in order. `AUTOCRAFT_BASE_URL` here is `https://new.example.com`.

1. Point DNS and TLS at the ingress, and set `AUTOCRAFT_BASE_URL` to the new origin on the dashboard. Restart. The server builds every callback from it and refuses to start without it.
2. Update the GitHub App (an app manager does this in the app's GitHub settings, under General):
   - Callback URL: `https://new.example.com/auth/callback`
   - Setup URL: `https://new.example.com/auth/github-app/setup`
   - Webhook URL: `https://new.example.com/webhooks/github` (see "Webhooks" in `docs/operations.md` for the events and the secret). A webhook that is off or fails leaves the minute poll in charge.

   While both domains are live, the app can list the old and new callback URLs together. `/auth/github-app/callback` is used only while registering a new app from the dashboard (it is the manifest's redirect and GitHub does not store it).
3. Update the OAuth app (Settings, Developer settings, OAuth Apps): Authorization callback URL `https://new.example.com/auth/callback`. An OAuth app accepts one URL, so the old origin stops working at that moment. This step is needed only while the GitHub identity is the box account.
4. Make the team instance sign in through the GitHub App, so that it does not depend on one person's OAuth app. The order matters:
   1. Register the GitHub App from the dashboard's GitHub App page (operators only) while the GitHub identity is the box account, or reuse the existing app and make sure its keys are in `secrets.json`.
   2. Install the app on the organization, grant the repositories, and test it: the GitHub App page shows the installation and its repositories.
   3. Only then set the GitHub identity to "GitHub App" on the GitHub App page (operators only; `autocraft identity app` does the same). It is refused unless the app is registered and its installation covers every tracked repo, and the refusal lists the repos that are not covered. Switching ends every dashboard session, so everyone signs in again through the GitHub App. To go back, choose "Box account" (the app cannot be removed while the identity is the GitHub App).
   4. Keep the OAuth app until everyone has signed in once through the GitHub App.
5. Session cookies (`__Host-craft_session`) belong to the exact host, so a new domain gives every user a new sign-in. Sessions live in the database and expire on their own: 14 days of inactivity, at most 30 days after sign-in, and 7 days at most for operators.
6. Agent (MCP) tokens are bearer tokens stored as hashes in the database and are not tied to a host. They keep working on the new origin as long as the database carries over (they do not depend on `session_key`). Each user changes the URL in their agent's configuration (`claude mcp add --transport http ... https://new.example.com/mcp --header "Authorization: Bearer <token>"`); the token itself stays. Tokens last 90 days (7 days for an answering token).
7. Build boxes: change `coordinatorUrl` in each worker's config to the new worker API address.

Check after the move: sign in, open the GitHub App page, and confirm the item pages load images and the inbox shows data.

## Open items

- Warm snapshot store. With more than one build machine, run `autocraft worker store serve` on a cache node (behind TLS or on the cluster network) and generate a signing key pair (`autocraft worker store keygen`), set `warmStore` in the worker configs (public key for all, write key and private key only for the trusted main-build workers). See `docs/operations.md` (Shared warm snapshot store). Not set up yet.
- Build pods or build boxes. The manifest has no build workers. Untrusted builds can run in separate pods or on separate boxes that call the worker API; this is not decided, and with boxes the worker API needs a TLS route.
- Registry. Where the image is pushed, who can push, and the pull credential in the cluster.
- Secret management. Today `secrets.json` is copied to the config volume by hand and `GH_TOKEN` comes from a Kubernetes Secret. Whether a secret manager replaces either is not decided.
- Runner settings on the real cluster (see above): untested.
- Off-volume backup copy: mechanism not chosen (on a VPS, see the migration runbook for an example).
- `jev` is not in the image; Haiku does its work (see "Not in the image").
