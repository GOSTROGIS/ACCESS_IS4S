#!/bin/bash
# Container entrypoint: the first argument picks the process. The commands match the systemd units.
#   dashboard   autocraft dash serve
#   runner      autocraft runner serve (also serves the worker API)
#   sync        autocraft sync [args]             one-shot
#   backup      deploy/backup.sh [PREFIX [KEEP]]  one-shot, default "daily"
#   anything else is passed to the autocraft CLI.
set -euo pipefail
cd /app
mkdir -p "${HOME:?}"
cli=(node --no-warnings src/cli.ts)
cmd="${1:-dashboard}"
[ "$#" -gt 0 ] && shift
case "$cmd" in
dashboard) exec "${cli[@]}" dash serve "$@" ;;
runner) exec "${cli[@]}" runner serve "$@" ;;
sync) exec "${cli[@]}" sync "$@" ;;
backup) exec bash deploy/backup.sh "${@:-daily}" ;;
*) exec "${cli[@]}" "$cmd" "$@" ;;
esac
