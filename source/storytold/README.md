# Storytold source collection and IS4S integration

All 82 public repositories listed across the three pages of
<https://github.com/orgs/storytold/repositories?type=all> were acquired on
16 November 2026. Their source checkouts are retained outside the IS4S checkout
at `/workspace/vendor-sources/storytold/`. These are reference/dependency source
copies, not additional IS4S application roots.

`source-snapshot.json` records the exact default-branch commit obtained for
every repository. Acquisition uses shallow Git history; Git LFS media downloads
and submodule recursion are omitted. This is a current-source collection, not
a full-history or release-asset mirror. Upstream code was not executed during
acquisition. Native applications and cloud services were not installed just
because their source was downloaded.

The snapshot is pinned and reproducible:

```sh
python3 source/storytold/fetch_sources.py --root /workspace/vendor-sources/storytold
```

Existing checkouts are preserved. If one is at another commit, the script
reports it rather than resetting or overwriting it. Disk space is checked
before new clones and downloads use at most four workers. The existing-copy
verification path was run across all 82 acquired repositories.

## What is integrated

The IS4S [visual practice studio](../../skills/digital/visual-studio/index.html)
now includes:

- A shot-framing workshop with live SVG previews, fit/fill, aspect ratio, zoom,
  focal position, thirds guides, a self-contained SVG export and an editable
  shot brief. Its fit-to-image math is an MIT-licensed adaptation of Artcraft's
  viewport helper; crop controls and the educational interface are IS4S code.
- Six short guided activities adapted from inspected Artcraft FAQ workflows,
  with source links pinned to the reviewed commit. Tool claims are presented
  as outcomes to check rather than guarantees.
- A searchable inventory of all 82 source repositories, with skill mappings,
  categories, licence metadata, recorded commits and runtime descriptions.
  Learners see creative/document tools first; they can include supporting
  libraries and research. Inventory status means source acquired, not an app
  installed in this browser.

The new work retains IS4S branding. Upstream copyright, source attribution and
the full selected MIT licence accompany the adapted code and learning
material. The upstream `NOTICE` is retained as well. Excluded sound effects,
memes, branded assets and other unlicensed third-party media are not copied
into IS4S. Repositories without an established licence remain in the source
inventory; their code is not thereby licensed for redistribution in IS4S.

See [the source review](artcraft-review.md) for exact files and architecture.
The public inventory and its generator are
`skills/digital/visual-studio/storytold-catalog.json` and `build_catalog.py`.
The builder reads the acquisition-time `catalog.json` and
`download-manifest.json` retained beside the source checkouts.

## Validation

Run the browser regression suite with the prepared Python environment:

```sh
/workspace/.venvs/access-is4s/bin/python source/site/test_visual_studio.py
```

Run `python3 source/check-links.py`, rebuild the Digital offline pack after
changes to the studio, and verify that its local scripts, catalogue, images
and vendor licence files are included. The complete Rust/Tauri/Craft apps
require separate builds and have not been validated as running IS4S features.
