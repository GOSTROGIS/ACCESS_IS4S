"""Build the IS4S reference catalog from a downloaded Storytold snapshot.

This reads repository metadata and README files; it never executes upstream code.
Run from the IS4S checkout:
  python3 source/storytold/build_catalog.py --source-root /workspace/vendor-sources/storytold
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'skills/digital/visual-studio/storytold-catalog.json'
RUST_WEB = 'Rust desktop application; README also describes a WebAssembly build. Not built or embedded in IS4S.'

# These descriptions summarize the checked upstream READMEs, not tested runtime
# guarantees. Skill connections describe educational fit, not embedded features.
APP_INFO = {
    'artcraft': ('ArtCraft', 'AI-assisted images, video and scene composition.', ['digital', 'creativity-innovation', 'communication'], 'creative', 'Tauri desktop: Rust, React and TypeScript. External generation providers require their own service access.'),
    'vectorcraft': ('VectorCraft', 'Vector illustration with paths, shapes and SVG workflows.', ['digital', 'creativity-innovation', 'communication'], 'creative', RUST_WEB),
    'filmcraft': ('FilmCraft', 'Nonlinear video editing with picture, colour and sound.', ['digital', 'communication', 'creativity-innovation'], 'creative', RUST_WEB),
    'wordcraft': ('WordCraft', 'Word processing with styles, tables, tracked changes and DOCX files.', ['writing', 'digital', 'communication'], 'documents', RUST_WEB),
    'effectcraft': ('EffectCraft', 'Compositions, layers, keyframes and motion effects.', ['digital', 'creativity-innovation', 'communication'], 'creative', RUST_WEB),
    'photocraft': ('PhotoCraft', 'Image editing with layers, masks, brushes and PSD files.', ['digital', 'creativity-innovation', 'communication'], 'creative', RUST_WEB),
    'figcraft': ('FigCraft', 'Interface layouts, components and interactive prototypes.', ['digital', 'creativity-innovation', 'problem-solving'], 'creative', RUST_WEB),
    'pdfcraft': ('PdfCraft', 'Read, organise, combine and split PDF documents.', ['reading', 'writing', 'digital'], 'documents', RUST_WEB),
    'designcraft': ('DesignCraft', 'Page layout and publishing with document import and export.', ['writing', 'communication', 'digital'], 'documents', RUST_WEB),
    'texturecraft': ('TextureCraft', 'Paint layered materials and textures onto 3D models.', ['digital', 'creativity-innovation'], 'creative', RUST_WEB),
    'autocraft': ('AutoCraft', 'Repository maintenance pipelines for issues, pull requests and model-assisted review.', [], 'support', 'Node 24+, pnpm, GitHub access and model CLIs. This is maintainer infrastructure, not a learner art tool.'),
    'lightcraft': ('LightCraft', 'Organise a photo library and develop raw images without overwriting originals.', ['digital', 'creativity-innovation'], 'creative', RUST_WEB),
    'anicraft': ('AniCraft', '2D vector animation using a timeline, layers, keyframes and tweens.', ['digital', 'creativity-innovation', 'communication'], 'creative', RUST_WEB),
    'deckcraft': ('DeckCraft', 'Create slides with themes, pictures, tables, charts and PPTX files.', ['communication', 'writing', 'digital'], 'documents', RUST_WEB),
    'cadcraft': ('CADCraft', 'Draft 2D and 3D drawings with dimensions, layers and DXF workflows.', ['numeracy', 'reading', 'digital', 'creativity-innovation'], 'technical', RUST_WEB),
    'gridcraft': ('GridCraft', 'Spreadsheet workbooks with formulas, styles and XLSX files.', ['numeracy', 'digital', 'problem-solving'], 'documents', RUST_WEB),
    'soundcraft': ('SoundCraft', 'Record, edit and mix audio with tracks, MIDI and a mixer.', ['communication', 'digital', 'creativity-innovation'], 'creative', RUST_WEB),
    'materialcraft': ('MaterialCraft', 'Build procedural materials in a node graph and export texture maps.', ['digital', 'creativity-innovation', 'numeracy'], 'creative', RUST_WEB),
    'craft-anything': ('Craft Anything', 'Inspect how software works and build a separate implementation with coding agents.', ['digital', 'problem-solving', 'creativity-innovation'], 'technical', RUST_WEB),
    'artcraftx': ('ArtCraft-X', 'Experimental desktop workspace for AI images, video, audio and 3D.', ['digital', 'creativity-innovation'], 'creative', 'Experimental Tauri desktop application with Rust and a Node/Vite frontend. Not built in IS4S.'),
}

SUPPORT = {
    'craft-libs', 'craft-contrib', 'craft-launcher', 'font-preview-service',
    'craft-i18n', 'craft-fonts', 'craft-common-actions', 'craft-repo-status-app',
    'craft-wiki', 'craft-ai-integrations', 'discord-github-ticket-relay',
    'artcraft-services', 'terraform-aws-observability-accelerator',
    'irsa-manager', 'craft-extensions', 'craft-pr-review-tool', 'craft-skills',
    'craft-launcher-assets', 'crafthub', 'cloud-worker', 'github-media',
    'redirect-vocodes', 'voder-proxy', 'discord-vocodes',
}
TECHNICAL = {
    'egui', 'winprint.rs', 'harfbuzz', 'winit', 'wgpu', 'spark', 'indd-utils',
    'RuntimeAudioImporter', 'RuntimeFilesDownloader', 'UnrealZeroMQ',
    'k4a-sys-temp', 'CloudCamPlugin', 'EventCenterPlugin',
    'ActorSpawningPlugin', 'UE4-OSC',
}
DESCRIPTIONS = {
    'craft-contrib': 'Shared contribution standards and maintainer guidance.',
    'craft-common-actions': 'Shared GitHub Actions used by the Craft repositories.',
    'irsa-manager': 'Infrastructure repository; inspect its source before reuse.',
    'FineTrainers-Conditioning': 'Model-training research source and configuration.',
    'discord-vocodes': 'Discord integration source for the related voice service.',
    'bevy-mocap': 'Motion-capture experiments using Bevy.',
    'crafthub': 'Craft ecosystem source; no learner-facing capability verified.',
    'cloud-worker': 'Cloud worker source; no learner-facing capability verified.',
    'placeholder-artcraft': 'Placeholder Artcraft repository.',
    'html_test': 'HTML test repository.',
    'vits-finetuning': 'Voice-model fine-tuning research.',
    'fakeyou-recast': 'Voice-service experiment; no learner-facing capability verified.',
    'motion-capture-data': 'Motion-capture session data for research.',
    'Azure-Kinect-Sample-for-Unity': 'Azure Kinect sample project for Unity.',
    'realtime-voice-conversion': 'Experimental microphone-to-model-to-speaker voice conversion.',
}


def runtime_for(path: Path) -> str:
    """Identify source requirements without pretending a program has run."""
    if not path.exists():
        return 'Source download not yet available; runtime not inspected.'
    if any(path.glob('*.uproject')):
        return 'Unreal Engine project or plugin source; requires a compatible engine. Not run in IS4S.'
    if (path / 'Cargo.toml').exists():
        return 'Rust source; a separate build is required. Not built or embedded in IS4S.'
    if (path / 'package.json').exists():
        return 'JavaScript/TypeScript source; separate dependencies or services may be required. Not run in IS4S.'
    if (path / 'ProjectSettings').exists():
        return 'Unity project source; requires a compatible Unity editor. Not run in IS4S.'
    if (path / 'CMakeLists.txt').exists():
        return 'Native source with a CMake build. Not built or embedded in IS4S.'
    return 'Reference source, assets or infrastructure; no IS4S runtime is included.'


def build(source_root: Path) -> dict:
    source_root = source_root.resolve()
    catalog = json.loads((source_root / 'catalog.json').read_text(encoding='utf-8'))
    manifest = json.loads((source_root / 'download-manifest.json').read_text(encoding='utf-8'))
    downloaded = {item['name']: item for item in manifest['repositories']}
    apps = []
    for listed in catalog['repositories']:
        name = listed['name']
        path = source_root / name
        record = downloaded.get(name, {})
        if name in APP_INFO:
            title, description, skills, category, runtime = APP_INFO[name]
            if not (path / 'README.md').is_file():
                raise ValueError(f'The documented application {name} needs its README before catalog generation.')
            basis = 'Upstream README.md reviewed; capabilities and runtime are upstream descriptions, not IS4S runtime validation.'
        else:
            title = name
            description = DESCRIPTIONS.get(name) or ' '.join((listed.get('description') or 'Reference repository; inspect source before reuse.').split())
            skills = []
            category = 'support' if name in SUPPORT else 'technical' if name in TECHNICAL else 'research'
            runtime = runtime_for(path)
            basis = 'GitHub public repository listing and local source-manifest detection.'
        apps.append({
            'name': name,
            'title': title,
            'description': description,
            'skills': skills,
            'category': category,
            'license': listed.get('license') or 'Not declared in GitHub listing; inspect repository before reuse.',
            'licenseBasis': 'GitHub listing metadata; not a file-by-file clearance or a license for every asset.',
            'sourceUrl': f'https://github.com/storytold/{name}',
            'commit': record.get('commit'),
            'status': record.get('status', 'pending'),
            'localSourcePath': str(path),
            'runtime': runtime,
            'sourceBasis': basis,
        })
    if len(apps) != catalog['repositoryCount'] or len({item['name'] for item in apps}) != len(apps):
        raise ValueError('The catalog does not contain every repository exactly once.')
    return {
        'retrieved': manifest['retrieved'],
        'source': catalog['source'],
        'total': catalog['repositoryCount'],
        'scope': 'Public default-branch source snapshots. Shallow Git clones; Git LFS media downloads skipped. Status records source acquisition, not installation or embedding in IS4S. External links require internet access.',
        'apps': apps,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', required=True, type=Path)
    parser.add_argument('--output', type=Path, default=OUT)
    args = parser.parse_args()
    result = build(args.source_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    counts = {status: sum(app['status'] == status for app in result['apps']) for status in sorted({app['status'] for app in result['apps']})}
    print(f"Saved {result['total']} repository records to {args.output}; source status: {counts}")


if __name__ == '__main__':
    main()
