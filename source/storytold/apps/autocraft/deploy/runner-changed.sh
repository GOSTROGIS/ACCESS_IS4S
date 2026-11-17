#!/bin/bash
# Whether a deploy from commit OLD to commit NEW changes code the pipeline runner runs.
# Usage: runner-changed.sh OLD NEW ROOT   (GIT_DIR or the current repo holds both commits;
# ROOT is a checkout of NEW). Prints "yes" or "no".
# Docs and Markdown never count. A file under web/ counts when the server code (ROOT/src)
# names it, or when a web file the server names imports it; everything else counts.
set -euo pipefail
old="$1" new="$2" root="$3"
if ! git cat-file -e "$old^{commit}" 2>/dev/null; then echo yes; exit 0; fi
mapfile -t named < <(grep -rhoE 'web/src/[A-Za-z0-9/._-]+\.tsx?' "$root/src" | sort -u)
used() {
	local f="$1" m
	for m in "${named[@]}"; do
		[ "$m" = "$f" ] && return 0
		[ -f "$root/$m" ] && grep -qE "from \"[^\"]*/$(basename "$f")\"" "$root/$m" && return 0
	done
	return 1
}
while IFS= read -r f; do
	case "$f" in
	docs/* | *.md) ;;
	web/*) if used "$f"; then echo yes; exit 0; fi ;;
	*) echo yes; exit 0 ;;
	esac
done < <(git diff --name-only "$old" "$new")
echo no
