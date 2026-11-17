from hashlib import file_digest
from pathlib import Path, PurePosixPath
import shutil
import sys
from tempfile import TemporaryDirectory
from zipfile import ZipFile


archive, parent = (Path(arg).resolve(strict=True) for arg in sys.argv[1:])
target = parent / 'npm'
expected = 'd2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5'
with archive.open('rb') as source:
    if file_digest(source, 'sha256').hexdigest() != expected:
        raise ValueError('Node archive digest differs from the official release')
prefix = 'node-v24.22.1-win-x64/node_modules/npm/'
with TemporaryDirectory(prefix='.npm-stage-', dir=parent) as staging, ZipFile(archive) as package:
    stage = Path(staging)/'npm'
    for member in package.infolist():
        if member.is_dir() or not member.filename.startswith(prefix):
            continue
        relative = PurePosixPath(member.filename[len(prefix):])
        if relative.is_absolute() or '..' in relative.parts or any('\\' in part or ':' in part for part in relative.parts):
            raise ValueError('Unsafe npm member')
        path = stage.joinpath(*relative.parts)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('xb') as out, package.open(member) as source:
            shutil.copyfileobj(source, out)
    files = {part.relative_to(stage): part for part in stage.rglob('*') if part.is_file()}
    if Path('bin/npm-cli.js') not in files:
        raise ValueError('Verified archive lacks npm CLI')
    if target.exists():
        if target.resolve() != target or any(candidate.resolve() != candidate for candidate in target.rglob('*')):
            raise ValueError('Linked npm installation')
        existing = {part.relative_to(target): part for part in target.rglob('*') if part.is_file()}
        if existing.keys() != files.keys() or any(file.read_bytes() != existing[name].read_bytes() for name,file in files.items()):
            raise ValueError('Installed npm differs from the verified archive')
    else:
        stage.rename(target)
print(f'Node archive verified; npm installed with {len(files)} files.')
