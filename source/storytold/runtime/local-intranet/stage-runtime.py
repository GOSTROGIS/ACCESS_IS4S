"""Stage the already signature-verified upstream package without activating it."""

import argparse
from pathlib import Path
import re

from prepare import install_tree, WORKSPACES
from import_releases import stage_asset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('staging', type=Path)
    parser.add_argument('installation', type=Path)
    parser.add_argument('kind', choices=('web', 'native'))
    parser.add_argument('application')
    parser.add_argument('version')
    parser.add_argument('sha256')
    parser.add_argument('entrypoint')
    args = parser.parse_args()
    if ((args.kind == 'web' and args.entrypoint != 'index.html') or
            (args.kind == 'native' and not re.fullmatch(r'[a-z0-9-]+\.exe', args.entrypoint))):
        parser.error('Invalid runtime entry point')
    staged = stage_asset({'name': args.application, 'tag': args.version, 'zipPath': args.archive,
                          'sha256Expected': args.sha256, 'status': 'checksum-and-signature-verified'},
                         args.staging, args.entrypoint)
    source = Path(staged['appRoot'])
    if args.kind == 'native':
        with (source / args.entrypoint).open('rb') as executable:
            if executable.read(2) != b'MZ':
                raise ValueError('Expected a Windows executable')
    family = 'web' if args.kind == 'web' else 'native/apps'
    destination = args.installation / 'Storytold' / family / args.application / args.version
    install_tree(source, destination, workspace=args.application if args.application in WORKSPACES else None)


if __name__ == '__main__':
    main()
