"""Recreate the inspected Storytold source collection without installing upstream code.

python3 source/storytold/fetch_sources.py --root /workspace/vendor-sources/storytold
Existing checkouts are inspected and preserved. New checkouts use shallow
history, the pinned snapshot commit and Git's existing HTTPS authentication.
Git LFS media and submodule checkouts are deliberately not fetched.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import re
import shutil
import subprocess


def git(*args, cwd=None):
    return subprocess.run(
        ['git', *args], cwd=cwd, check=False, capture_output=True, text=True,
        env=dict(os.environ, GIT_LFS_SKIP_SMUDGE='1', GIT_TERMINAL_PROMPT='0'))


def fetch_one(repo, root):
    name, commit = repo['name'], repo['commit']
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', name) or name in {'.', '..'}:
        return name, 'failed: invalid repository name'
    if not re.fullmatch(r'[a-f0-9]{40}', commit):
        return name, 'failed: invalid pinned commit'
    url = f'https://github.com/storytold/{name}.git'
    target = root / name
    if target.exists():
        if not (target / '.git').exists():
            return name, 'preserved: existing path is not a Git checkout'
        head = git('rev-parse', '--verify', 'HEAD^{commit}', cwd=target)
        if head.returncode == 0 and head.stdout.strip() == commit:
            return name, 'verified existing snapshot'
        return name, 'preserved: existing checkout has a different or unreadable HEAD'
    if shutil.disk_usage(root).free < 8 * 1024 ** 3:
        return name, 'blocked: fewer than 8 GiB of disk space remain'
    result = git('clone', '--depth', '1', '--filter=blob:none', '--no-checkout', url, str(target))
    if result.returncode:
        return name, 'failed: source clone failed; existing files were kept'
    # Only a new checkout is moved to the recorded commit. Never reset user work.
    result = git('fetch', '--depth', '1', 'origin', commit, cwd=target)
    if result.returncode:
        return name, 'failed: pinned commit could not be fetched; partial checkout kept'
    result = git('checkout', '--detach', commit, cwd=target)
    if result.returncode:
        return name, 'failed: pinned checkout failed; partial checkout kept'
    return name, 'downloaded pinned snapshot'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('/workspace/vendor-sources/storytold'))
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    args.root.mkdir(parents=True, exist_ok=True)
    snapshot = json.loads(Path(__file__).with_name('source-snapshot.json').read_text())
    failures = []
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 4))) as pool:
        tasks = [pool.submit(fetch_one, repo, args.root) for repo in snapshot['repositories']]
        for future in as_completed(tasks):
            name, status = future.result()
            print(f'{name}: {status}', flush=True)
            if not status.startswith(('verified', 'downloaded')):
                failures.append(name)
    print(f"Verified or downloaded {snapshot['repositoryCount'] - len(failures)} of {snapshot['repositoryCount']} source snapshots.")
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
