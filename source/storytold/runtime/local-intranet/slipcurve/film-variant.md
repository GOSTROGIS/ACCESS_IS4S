# Installed Slipcurve Video variant

This is a separate genuine FilmCraft source build with the compiled owner
identity **Slipcurve Video**, upstream functionality and licences retained.
Its runtime identity is `slipcurve-filmcraft`; its page API and project bridge
keep the original `filmcraft` identity. ACCESS continues using port 4191.
Slipcurve uses the separate installed runtime on port 4211.

The public receipt `film-variant.json` pins the ZIP, WASM and build-manifest
SHA-256 values. Source commit:
`d6e78890f19baba37b062319fb45a1f2408a3450` from
<https://github.com/storytold/filmcraft>. The branded build includes the verified
browser encoder compatibility patch and source-level owner labels. The
original notices, fonts and licence files remain in the compiled distribution.

Install the supplied compiled artifact into an existing folder intranet:

```sh
python source/storytold/runtime/local-intranet/slipcurve/install-film-variant.py \
  --archive slipcurve-video-0.20.1-d6e7889.zip \
  --installation /path/to/Applications
```

The installer checks the pinned archive, rejects unsafe ZIP entries, verifies
the exact build manifest and all 16 payload files, stages and rechecks the tree,
then renames it atomically into
`Storytold/web/slipcurve-filmcraft/v0.20.1-slipcurve-d6e7889`.
Existing modified trees or conflicting registries are preserved and refused.
It writes only the public `installed-variants.json` mapping, with no private
paths or credentials. It does not rewrite `installed-web.json`.

After installing the updated server and restarting the folder services:

- `http://127.0.0.1:4211/` serves the genuine branded editor.
- `http://127.0.0.1:4211/slipcurve-workspace/editor.json` identifies its API as
  `filmcraft`, while reporting the Slipcurve label.
- `applications.json` and `health.json` retain the 17 base applications and list
  the variant separately.
- Slipcurve's authenticated folder client permits only the added exact 4211
  iframe origin and uses 4211 for its Video editor choice.

The variant registry is optional when absent. When present, the server accepts
only this exact pinned mapping, verifies the build-manifest hash and every
payload file before starting the listener, and serves it through the same
bounded static-file handler as the base runtimes. No HTTP request launches a
process or selects an arbitrary port, path or source application.

This installation is pinned. It must not be replaced by an unbranded official
binary during scheduled upstream updates. A new branded build needs a reviewed
receipt and the same real import/edit/project/export/decode regression before
activation. Installing this variant does not prove every native feature or
hardware/provider integration has been verified.
