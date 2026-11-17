"""Install the pinned genuine Slipcurve Video build into an existing folder intranet."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys
import tempfile
from zipfile import ZipFile

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE.parents[1]))
from import_releases import checked_members, digest, verify_existing


def install(archive_path, installation):
    registry_bytes = (SOURCE / 'film-variant.json').read_bytes()
    registry = json.loads(registry_bytes)
    pin = registry['apps'][0]
    if digest(archive_path) != pin['artifactSha256']:
        raise ValueError('Archive differs from the pinned compiled Slipcurve build')
    installation = installation.absolute()
    if installation.resolve() != installation or not (installation / 'installed-web.json').is_file():
        raise ValueError('Choose an existing, unredirected folder intranet installation')
    destination = installation / 'Storytold/web' / pin['id'] / pin['version']
    for ancestor in destination.parents:
        if ancestor.exists() and ancestor.resolve() != ancestor:
            raise ValueError('Variant destination has a redirected ancestor')
        if ancestor == installation:
            break
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.parent.resolve() != destination.parent or destination.resolve() != destination:
        raise ValueError('Variant destination is redirected')
    with ZipFile(archive_path) as archive:
        members = checked_members(archive)
        manifest_bytes = archive.read('build-manifest.json')
        if sha256(manifest_bytes).hexdigest() != pin['buildManifestSha256']:
            raise ValueError('Build manifest differs from its pin')
        build = json.loads(manifest_bytes)
        if build['application'] != pin['label'] or build['upstreamApplication'] != 'FilmCraft' or build['wasmSha256'] != pin['wasmSha256']:
            raise ValueError('The archive does not describe the expected genuine branded build')
        expected = set(build['files']) | {'build-manifest.json'}
        actual = {relative.as_posix() for info, relative in members if not info.is_dir()}
        if len(build['files']) != 16 or actual != expected:
            raise ValueError('Unexpected or missing application files')
        for name, receipt in build['files'].items():
            data = archive.read(name)
            if len(data) != receipt['bytes'] or sha256(data).hexdigest() != receipt['sha256']:
                raise ValueError(f'Application file differs from its build receipt: {name}')
        if destination.exists():
            verify_existing(destination, archive, members)
        else:
            with tempfile.TemporaryDirectory(prefix='.slipcurve-video-', dir=destination.parent) as temporary:
                candidate = Path(temporary) / 'app'
                candidate.mkdir()
                archive.extractall(candidate)
                verify_existing(candidate, archive, members)
                candidate.rename(destination)
    registry_path = installation / 'installed-variants.json'
    if registry_path.exists():
        if registry_path.resolve() != registry_path or json.loads(registry_path.read_text(encoding='utf-8')) != registry:
            raise ValueError('A different variant registry was preserved; review it before installation')
    else:
        temporary = registry_path.with_suffix('.tmp')
        with temporary.open('xb') as stream:
            stream.write(registry_bytes)
        temporary.replace(registry_path)
    print(json.dumps({'installed': pin['id'], 'version': pin['version'], 'port': pin['port'],
                      'files': len(expected), 'payloadFiles': len(build['files']),
                      'archiveSha256': pin['artifactSha256'], 'wasmSha256': pin['wasmSha256']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True, type=Path)
    parser.add_argument('--installation', required=True, type=Path)
    args = parser.parse_args()
    install(args.archive, args.installation)
