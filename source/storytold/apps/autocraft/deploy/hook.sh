#!/bin/bash
# The deploy of a production install, run by deploy/post-receive as the app user
# with cwd = the bare repo and GIT_DIR set. Layout under the install root
# (default: the parent of the bare repo):
#
#   repo.git/  releases/<commit>/  app -> releases/<commit>  data/  cache/  config/autocraft.env
#
# Every path and name comes from config/autocraft.env (see the README section
# "Production install") or from the variables below.
#
#   AUTOCRAFT_ROOT             install root (default: parent of the bare repo)
#   AUTOCRAFT_ENV_FILE         default $AUTOCRAFT_ROOT/config/autocraft.env
#   AUTOCRAFT_BRANCH           branch that deploys (default main)
#   AUTOCRAFT_DEPLOY_SHA       the commit to deploy (deploy/post-receive passes the pushed one;
#                              default: the branch's commit when the hook starts)
#   AUTOCRAFT_UNITS            systemd units restarted after the build
#                              (default "autocraft-dashboard autocraft-runner"; empty for none).
#                              Not restarted while the database file does not exist yet.
#   AUTOCRAFT_RUNNER_UNIT      the unit that runs the pipeline (default autocraft-runner). It is
#                              restarted only when the code it runs changed since its release
#                              (deploy/runner-changed.sh); otherwise it keeps that release, whose
#                              commit is in $AUTOCRAFT_ROOT/.runner-release, and the release stays.
#   AUTOCRAFT_SUDO             command prefix for the restart (default "sudo -n")
#   AUTOCRAFT_WORKER_SSH       user@host of the sandbox worker's admin SSH command; when set
#                              and $AUTOCRAFT_ROOT/.ssh/id_craftsandbox exists, the worker code
#                              is updated to this commit once the worker has no running tasks
#   AUTOCRAFT_HEALTH_URL       URL polled after the restart (default: http://$AUTOCRAFT_LISTEN/)
#
# Order: snapshot the database, stop the sync timer, build the new release beside
# the running one, switch the `app` symlink, restart, start the timer. A failure
# before the switch leaves the previous release running on an unmigrated database.
# After a failed deploy, pushing again does nothing (the branch already moved);
# redeploy by running the bare repo's hook by hand (printed on failure).
#
#   AUTOCRAFT_TIMER            sync timer paused during the deploy (default autocraft-sync.timer)
#   AUTOCRAFT_KEEP_RELEASES    releases kept besides the current one (default 2)
set -euo pipefail

GIT_DIR="$(cd "${GIT_DIR:-.}" && pwd)"
export GIT_DIR
ROOT="${AUTOCRAFT_ROOT:-$(dirname "$GIT_DIR")}"
BRANCH="${AUTOCRAFT_BRANCH:-main}"
ENV_FILE="${AUTOCRAFT_ENV_FILE:-$ROOT/config/autocraft.env}"
SUDO="${AUTOCRAFT_SUDO:-sudo -n}"
TIMER="${AUTOCRAFT_TIMER-autocraft-sync.timer}"
SYNC_UNIT="${TIMER%.timer}.service"

export HOME="${HOME:-$ROOT}"
export PATH="$ROOT/.local/bin:/usr/local/bin:/usr/bin:/bin"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if [ -r "$ENV_FILE" ]; then
	set -a
	# shellcheck disable=SC1090
	. "$ENV_FILE"
	set +a
	AUTOCRAFT_DB="${AUTOCRAFT_DB:-${CRAFT_AUTO_DB:-}}"
	AUTOCRAFT_LISTEN="${AUTOCRAFT_LISTEN:-${CRAFT_AUTO_LISTEN:-}}"
else
	echo "!! $ENV_FILE is missing; create it first (README, Production install)" >&2
	exit 1
fi

timer_stopped=0
on_exit() {
	rc=$?
	if [ "$timer_stopped" = 1 ]; then $SUDO systemctl start "$TIMER" || true; fi
	if [ "$rc" -ne 0 ]; then
		echo "!! deploy failed. After fixing the cause, redeploy this commit by running, as this user:" >&2
		echo "   cd $GIT_DIR && echo \"0 ${sha:-\$(git rev-parse $BRANCH)} refs/heads/$BRANCH\" | GIT_DIR=. hooks/post-receive" >&2
	fi
}
trap on_exit EXIT

exec {lockfd}>"$ROOT/.deploy.lock"
if ! flock -n "$lockfd"; then
	echo "!! another deploy is running; wait for it, then redeploy" >&2
	exit 1
fi

# Resolved once: everything below deploys this commit, even if the branch moves during the deploy.
sha="$(git rev-parse --verify --quiet "${AUTOCRAFT_DEPLOY_SHA:-refs/heads/$BRANCH}^{commit}")" || { echo "!! ${AUTOCRAFT_DEPLOY_SHA:-$BRANCH} is not a commit" >&2; exit 1; }
REL="$ROOT/releases/$sha"
echo "-- Deploying ${sha:0:12} to $REL --"

# Snapshot first: nothing of the new code has touched the database yet.
if [ -n "${AUTOCRAFT_DB:-}" ] && [ -f "$AUTOCRAFT_DB" ]; then
	echo "-> Snapshotting the database..."
	bash "$ROOT/app/deploy/backup.sh" predeploy 3 2>/dev/null || {
		# First deploy of this layout has no app/ yet: use the checkout about to be built.
		snapshot_pending=1
	}
fi

if [ -n "$TIMER" ]; then
	$SUDO systemctl stop "$TIMER"
	timer_stopped=1
	for _ in $(seq 1 150); do
		systemctl is-active --quiet "$SYNC_UNIT" || break
		sleep 2
	done
	if systemctl is-active --quiet "$SYNC_UNIT"; then echo "!! warning: a sync run is still going after 300 s; deploying anyway" >&2; fi
fi

# Redeploying the live commit (after a failure past the switch) reuses its release:
# deleting it would pull the files from under the running services.
if [ "$(readlink "$ROOT/app" 2>/dev/null)" = "releases/$sha" ] && [ -f "$REL/.source-commit" ]; then
	echo "-> ${sha:0:12} is the live release; reusing it."
	live=1
else
	echo "-> Checking out..."
	rm -rf "$REL"
	mkdir -p "$REL"
	# Files of the resolved commit only; HEAD of the bare repo stays on the branch.
	git --work-tree="$REL" checkout -f --no-overlay "$sha" -- .
	printf '%s\n' "$sha" >"$REL/.source-commit"
fi
cd "$REL"

# The bootstrap hook is part of the release: the next push runs the one this commit carries.
if [ -f "$REL/deploy/post-receive" ] && ! cmp -s "$REL/deploy/post-receive" "$GIT_DIR/hooks/post-receive"; then
	echo "-> Updating the post-receive hook..."
	install -m 0755 "$REL/deploy/post-receive" "$GIT_DIR/hooks/post-receive.new"
	mv -f "$GIT_DIR/hooks/post-receive.new" "$GIT_DIR/hooks/post-receive"
fi

if [ "${snapshot_pending:-0}" = 1 ]; then
	echo "-> Snapshotting the database..."
	bash "$REL/deploy/backup.sh" predeploy 3
fi

if [ "${live:-0}" != 1 ]; then
	echo "-> Installing dependencies..."
	pnpm install --frozen-lockfile --prod --ignore-scripts

	echo "-> Building the web app..."
	# Install scripts stay off; only esbuild needs its own to place its binary.
	pnpm -C web install --frozen-lockfile --ignore-scripts
	pnpm -C web rebuild esbuild
	pnpm -C web exec tsc --noEmit
	pnpm -C web exec vite build --outDir dist --emptyOutDir
fi

echo "-> Checking that the CLI loads..."
usage="$(node --no-warnings src/cli.ts)"
for c in dash runner sync; do
	printf '%s\n' "$usage" | grep -Eq "^ +$c " || { echo "!! the CLI does not list '$c'; a module failed to load" >&2; exit 1; }
done

runner_unit="${AUTOCRAFT_RUNNER_UNIT:-autocraft-runner}"
# Before this file existed every deploy restarted the runner, so it runs the live release.
runner_sha="$(cat "$ROOT/.runner-release" 2>/dev/null || cat "$ROOT/app/.source-commit" 2>/dev/null || true)"
runner_changed="$(bash "$REL/deploy/runner-changed.sh" "${runner_sha:-none}" "$sha" "$REL")"

if [ "$runner_changed" = yes ] && [ -n "${AUTOCRAFT_WORKER_SSH:-}" ] && [ -f "$ROOT/.ssh/id_craftsandbox" ]; then
	# Records the update instead of running it while the worker has tasks; the runner applies it later.
	node --no-warnings src/cli.ts worker update-code --sha "$sha" --ssh "$AUTOCRAFT_WORKER_SSH" --key "$ROOT/.ssh/id_craftsandbox" --git-dir "$GIT_DIR"
fi

echo "-> Switching app to ${sha:0:12}..."
ln -sfn "releases/$sha" "$ROOT/app.new"
mv -T "$ROOT/app.new" "$ROOT/app"

units="${AUTOCRAFT_UNITS-autocraft-dashboard autocraft-runner}"
if [ -n "$units" ] && [ -n "${AUTOCRAFT_DB:-}" ] && [ ! -f "$AUTOCRAFT_DB" ]; then
	echo "-> No database at $AUTOCRAFT_DB yet; built, not restarting."
	units=""
fi
if [ -n "$units" ] && [ "$runner_changed" = no ]; then
	echo "-> The runner's code is unchanged since ${runner_sha:0:12}; it keeps running that release."
	units="$(printf '%s\n' $units | { grep -vx "$runner_unit" || true; } | tr '\n' ' ' | sed 's/ *$//')"
fi
if [ -n "$units" ]; then
	echo "-> Restarting: $units"
	# shellcheck disable=SC2086
	for u in $units; do $SUDO systemctl restart "$u.service"; done
	url="${AUTOCRAFT_HEALTH_URL:-http://${AUTOCRAFT_LISTEN:-127.0.0.1:8993}/}"
	up=0
	for _ in $(seq 1 30); do
		if curl -s -o /dev/null --max-time 2 "$url"; then up=1; break; fi
		sleep 1
	done
	[ "$up" = 1 ] || { echo "!! no answer from $url after the restart; see journalctl -u ${units%% *}" >&2; exit 1; }
	sleep 3
	for u in $units; do
		systemctl is-active --quiet "$u.service" || { echo "!! $u is not active after the restart; see journalctl -u $u" >&2; exit 1; }
	done
	echo "-> Up: $url"
	case " $units " in *" $runner_unit "*) printf '%s\n' "$sha" >"$ROOT/.runner-release" ;; esac
fi

# Keep the current release and the newest few others.
keep="${AUTOCRAFT_KEEP_RELEASES:-2}"
# The runner's release stays while the runner runs it.
runner_keep="$(cat "$ROOT/.runner-release" 2>/dev/null || true)"
ls -1t "$ROOT/releases" | { grep -vx -e "$sha" -e "${runner_keep:-$sha}" || true; } | tail -n +$((keep + 1)) | while read -r old; do rm -rf "$ROOT/releases/$old"; done
