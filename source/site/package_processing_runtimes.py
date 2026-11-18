"""Publish the 17 verified browser distributions used by ACCESS Processing Tools.

Pass a cache of pinned upstream ZIPs (<id>.zip or the original release filename)
and the two approved ACCESS build ZIPs. --check reproduces and compares the
shipped bytes. The launcher's separate host pages are outside this packager.
"""

import argparse
import gzip
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tempfile
from zipfile import ZipFile


REPO = Path(__file__).resolve().parents[2]
RUNTIME = REPO / "source/storytold/runtime"
sys.path.insert(0, str(RUNTIME))
sys.path.insert(0, str(RUNTIME / "local-intranet"))
from import_releases import checked_members, digest
from prepare import ACCESS_TOOLS, LABELS

# These locally built releases passed their ACCESS export/editor workflows.
# Pin the entire distribution, including the JavaScript and license payloads.
BUILDS = {
    "filmcraft": ("v0.20.1-is4s", "66690c8cdda5795b4bb5968313f9ee7cb375a270f032f72b40504ce64adf8e84"),
    "wordcraft": ("v0.18.1-access-870d2004", "7976b2b779a7da83aaa2391d8d2dddd50677e87ecbe163e9764474fc9de5b30a"),
}
PHOTO_SNIPPET = "snippets/eframe-d31a8450ea12dfc1/inline0.js"


def json_bytes(data):
    return (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def unique_name(files, pattern):
    names = [name for name in files if re.fullmatch(pattern, name)]
    if len(names) != 1:
        raise ValueError(f"Expected one PDF runtime file matching {pattern}")
    return "../" + names[0]


def copy_package(identifier, archive_path, checksum, staged):
    if digest(archive_path) != checksum:
        raise ValueError(f"{identifier}: release ZIP does not match its pinned SHA-256")
    with ZipFile(archive_path) as archive:
        members = [(info, path) for info, path in checked_members(archive) if not info.is_dir()]
        if identifier in BUILDS:
            files = {path.as_posix(): info for info, path in members}
        else:
            roots = {path.parts[0] for _, path in members}
            if len(roots) != 1 or any(len(path.parts) < 2 for _, path in members):
                raise ValueError(f"{identifier}: expected one release root")
            files = {PurePosixPath(*path.parts[1:]).as_posix(): info for info, path in members}
        if "index.html" not in files or not any(n.endswith(".wasm") for n in files):
            raise ValueError(f"{identifier}: incomplete browser application")
        if identifier == "photocraft":
            # The boot module imports this snippet relative to /app as well.
            files["app/" + PHOTO_SNIPPET] = files[PHOTO_SNIPPET]
        config = {"id": identifier, "label": ACCESS_TOOLS[identifier], "entry": "../index.html"}
        if identifier == "pdfcraft":
            config.update(loader=unique_name(files, r"pdfcraft-web-[a-f0-9]+\.js"),
                          wasm=unique_name(files, r"pdfcraft-web-[a-f0-9]+_bg\.wasm"),
                          worker=unique_name(files, r"pdfcraft-ocr-worker-[a-f0-9]+_loader\.js"))
        for name, info in sorted(files.items()):
            if name in (".htaccess", "_headers"):
                continue
            if name.endswith((".gz", ".br")) and name[:-3] in files:
                continue
            if name.startswith("host/"):
                raise ValueError(f"{identifier}: upstream payload conflicts with the ACCESS host")
            destination = name + ".gz.bin" if name.endswith(".wasm") else name
            if destination != name and destination in files:
                raise ValueError(f"{identifier}: compressed output collides with an upstream file")
            target = staged / destination
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, target.open("xb") as output:
                if name.endswith(".wasm"):
                    with gzip.GzipFile(filename="", fileobj=output, mode="wb", mtime=0, compresslevel=6) as compressed:
                        shutil.copyfileobj(source, compressed, length=1024 * 1024)
                else:
                    shutil.copyfileobj(source, output, length=1024 * 1024)
        (staged / "host").mkdir()
        (staged / "host/editor.json").write_bytes(json_bytes(config))


def publish(args):
    pins = {item["id"]: item.get("releaseArtifact", {})
            for item in json.loads((RUNTIME / "app-targets.json").read_text("utf-8"))["targets"]}
    destination = args.output.absolute()
    if destination.resolve() != destination:
        raise ValueError("Redirected publication directory")
    # Stage all archives before changing any output. Install generated files
    # individually so the independent host UI and service worker are preserved.
    with tempfile.TemporaryDirectory(prefix="processing-runtimes-") as temp:
        staging = Path(temp)
        catalogue = []
        for port, identifier in enumerate(LABELS, 4190):
            pin = pins[identifier]
            version = pin["tag"]
            if identifier in BUILDS:
                version, checksum = BUILDS[identifier]
                archive = getattr(args, identifier)
            else:
                checksum = pin["sha256Expected"]
                archive = args.release_cache / Path(pin["zipUrl"]).name
                if not archive.is_file():
                    archive = args.release_cache / (identifier + ".zip")
                if identifier == "photocraft":
                    version += "-hosting-fix"
            copy_package(identifier, archive, checksum, staging / "apps" / identifier)
            catalogue.append({"id": identifier, "port": port, "version": version, "distribution": "pages"})
            print(f"Verified {identifier} {version}", flush=True)
        (staging / "applications.json").write_bytes(json_bytes({"apps": catalogue, "native": []}))
        files = [p for p in sorted(staging.rglob("*")) if p.is_file()]
        for raw in (destination / "apps").glob("*/**/*.wasm"):
            raise ValueError(f"Unexpected uncompressed module in publication: {raw.relative_to(destination)}")
        for source in files:
            name = source.relative_to(staging)
            out = destination / name
            if out.resolve() != out:
                raise ValueError(f"Redirected public output at {name}")
            if out.is_file() and digest(out) == digest(source):
                continue
            if args.check:
                raise ValueError(f"Public runtime bytes differ at {name}")
            out.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=out.parent, prefix=".package-", delete=False) as tmp:
                partial = Path(tmp.name)
            try:
                shutil.copyfile(source, partial)
                partial.replace(out)
            finally:
                partial.unlink(missing_ok=True)
        print(f"{len(catalogue)} browser distributions, {len(files)} published files, "
              f"{sum(p.stat().st_size for p in files):,} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-cache", type=Path, required=True)
    parser.add_argument("--filmcraft", type=Path, required=True)
    parser.add_argument("--wordcraft", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=REPO / "processing-tools")
    parser.add_argument("--check", action="store_true")
    publish(parser.parse_args())
