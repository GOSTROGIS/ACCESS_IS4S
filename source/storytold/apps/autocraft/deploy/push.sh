#!/bin/bash
# Deploy: push a branch to the production bare repo; its post-receive hook builds and restarts.
#   deploy/push.sh [REMOTE] [REF]
# REMOTE is a git remote name or URL (default: `git config autocraft.remote`),
# REF defaults to main and lands on the remote's main.
set -euo pipefail
cd "$(dirname "$0")/.."
remote="${1:-$(git config --get autocraft.remote || true)}"
[ -n "$remote" ] || { echo "usage: deploy/push.sh REMOTE [REF]  (or git config autocraft.remote URL)" >&2; exit 2; }
git push "$remote" "${2:-main}":main
