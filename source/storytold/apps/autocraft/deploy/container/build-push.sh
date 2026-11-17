#!/bin/bash
# Builds the AutoCraft image on this machine and pushes it to a registry. No CI is involved.
#   AUTOCRAFT_REGISTRY=registry.example.com/team/autocraft deploy/container/build-push.sh [--no-push]
# Tags: the git commit (short sha) and `latest`. Refuses a dirty working tree, so a tag always
# names the code inside the image. Uses docker or podman, whichever is installed (docker first);
# DOCKER_HOST is honoured by both. --no-push builds only; AUTOCRAFT_REGISTRY is then optional
# and the local name is `autocraft`.
# Extra build arguments go through BUILD_ARGS, for example BUILD_ARGS="--build-arg CLAUDE_CODE_VERSION=2.1.309".
set -euo pipefail

push=1
case "${1:-}" in
"") ;;
--no-push) push=0 ;;
-h | --help) sed -n '2,8p' "$0"; exit 0 ;;
*) echo "usage: build-push.sh [--no-push]" >&2; exit 2 ;;
esac

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "refusing to build: the working tree has uncommitted or untracked changes" >&2
  exit 1
fi
commit="$(git rev-parse --short=12 HEAD)"

if command -v docker >/dev/null; then engine=docker
elif command -v podman >/dev/null; then engine=podman
else echo "neither docker nor podman is installed" >&2; exit 1
fi

repo="${AUTOCRAFT_REGISTRY:-}"
if [ "$push" = 1 ] && [ -z "$repo" ]; then
  echo "AUTOCRAFT_REGISTRY is not set (for example registry.example.com/team/autocraft)" >&2
  exit 1
fi
repo="${repo:-autocraft}"

echo "building $repo:$commit with $engine"
# BUILD_ARGS is split on spaces on purpose.
# shellcheck disable=SC2086
"$engine" build -f deploy/container/Dockerfile --build-arg "SOURCE_COMMIT=$(git rev-parse HEAD)" \
  ${BUILD_ARGS:-} -t "$repo:$commit" -t "$repo:latest" .

if [ "$push" = 1 ]; then
  "$engine" push "$repo:$commit"
  "$engine" push "$repo:latest"
  echo "pushed $repo:$commit and $repo:latest"
else
  echo "built $repo:$commit and $repo:latest (not pushed)"
fi
