"""Stable entry point for the installed SLIPCURVE folder and its durable data."""

from pathlib import Path
import runpy
import sys


home = Path(__file__).resolve().parent
release = runpy.run_path(str(home / 'slipcurve-release.py'))
current = release['registry'](home)['current']
runtime = release['verify_record'](home, current)
entry = release['canonical'](runtime / 'folder-serve.py')
sys.argv[:] = [str(entry), '--data-dir', str(home / 'data'), *sys.argv[1:]]
runpy.run_path(str(entry), run_name='__main__')
