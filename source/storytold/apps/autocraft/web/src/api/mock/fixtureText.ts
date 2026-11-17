// Issue and PR descriptions and AI summaries for the fixture decisions.
// Written to read like real contributions; the reference apps are never named.

export const TEXT: Record<string, { summary: string; body: string | null }> = {
  "designcraft#1484": {
    summary:
      "Adds Hungarian spellchecking and nonstandard hyphenation by committing the LibreOffice dictionary and the TeX hyphenation patterns, about 270,000 lines of data. The code change is small and review found no issues. craft-i18n already ships a Hungarian language pack.",
    body: `This adds Hungarian to the text engine.

- Spellcheck: the LibreOffice \`hu_HU\` dictionary, committed under \`crates/text/data/hu/\`.
- Hyphenation: the TeX patterns for Hungarian, including the nonstandard rules.
- A loader in \`crates/text/src/lang/hu.rs\` and tests for both.`,
  },
  "photocraft#4127": {
    summary:
      "Adds a Wave distortion filter under Filter › Distort with the five parameters the reference app exposes (generators, wavelength, amplitude, scale, type). Rendering runs in a new WGSL shader with a CPU fallback for machines without compute support. The live preview matches the reference output at default settings on the three test images the author attached. The risk is low: the filter is self-contained and follows the existing distort module, but the CPU path takes about 4 s on an 8K image. Classifiers and the review agree it is a missing reference-app feature.",
    body: `## What

Adds **Filter › Distort › Wave** with live preview, matching the reference app's dialog:

- Number of generators (1–999)
- Wavelength min/max, amplitude min/max
- Horizontal / vertical scale
- Type: sine, triangle, square
- Undefined areas: wrap around / repeat edge pixels
- "Randomize" button (seeded, so previews are stable)

Closes #3880.

## How

The filter lives in \`crates/filters/src/distort/wave.rs\` next to Ripple and Twirl, and reuses \`DistortParams\` for the edge modes. The GPU path is a single compute pass:

\`\`\`wgsl
@compute @workgroup_size(8, 8)
fn wave(@builtin(global_invocation_id) id: vec3<u32>) {
    let uv = vec2<f32>(id.xy) / params.size;
    var offset = vec2<f32>(0.0);
    for (var i = 0u; i < params.generators; i++) {
        offset += wave_offset(uv, i);
    }
    textureStore(out_tex, id.xy, sample_edge(uv + offset * params.scale));
}
\`\`\`

The CPU fallback is used when the adapter has no compute support (some older integrated GPUs).

## Testing

- Golden-image tests for each wave type at default settings (\`tests/filters/wave_golden.rs\`)
- Compared against the reference app on three images; max per-channel difference is 2/255
- Preview stays above 30 fps on a 4K canvas on an M1 and a GTX 1660

![Side-by-side with the reference app](https://user-images.githubusercontent.com/10293/wave-compare.png)

## Notes

- The CPU path is slow above 8K (about 4 s). Every other distort filter has the same limit, so I left it.
- I did not add the "Undefined areas: transparent" mode; the reference app only offers it for layers with transparency, and our layer model doesn't expose that yet.`,
  },
  "designcraft#2210": {
    summary:
      "Adds animated WebP export for artboards that have prototype transitions, encoding each frame with libwebp through a new `libwebp-sys` dependency (1.4 MB). The reference app only exports static frames, so this goes beyond it. The export dialog gains a frame-rate and loop setting; static exports are unchanged. The main cost is the native dependency and its build on Windows and WASM, where the PR disables the feature. Classifiers split between small extra and plugin candidate.",
    body: `Animated exports come up a lot in the community chat (people want to share prototype previews without screen recording).

### Changes
- New \`export::webp_anim\` module, behind the \`anim-webp\` cargo feature (on by default on Linux and macOS)
- Export dialog: format "WebP (animated)", frame rate (12/24/30/60), loop count
- Frames come from the prototype timeline, so only artboards with transitions get the option

### Open questions
1. Is \`libwebp-sys\` OK as a dependency? It adds ~1.4 MB to the binary.
2. WASM build: I disabled the feature there; the encoder doesn't build for wasm32 without extra work.

Demo: https://user-images.githubusercontent.com/55120/anim-export-demo.webp`,
  },
  "filmcraft#3381": {
    summary:
      "Fixes audio drifting out of sync after about 40 minutes of playback, caused by rounding the sample position to whole milliseconds on every clock tick. The fix keeps the clock in samples and converts only for display. filmcraft#3302 fixes the same bug with a slightly different change but has no test; this PR adds a regression test that plays two simulated hours. Both are small and green; keeping this one and closing #3302 loses nothing.",
    body: `Fixes #3290.

The playback clock converted samples → ms → samples on every tick, losing up to 0.5 ms per tick at 48 kHz. Over 40 min that adds up to ~1.2 s of drift.

**Fix:** keep \`PlaybackClock::position\` in samples (\`u64\`) and only convert when the UI asks for a timecode.

\`\`\`rust
pub fn advance(&mut self, frames: u64) {
    self.position_samples += frames; // was: self.position_ms += frames as f64 / rate * 1000.0
}
\`\`\`

**Test:** \`tests/playback/long_run.rs\` simulates 2 h of playback and asserts drift < 1 sample.

I saw #3302 after opening this; it fixes the same thing by rounding differently but still converts every tick.`,
  },
  "wordcraft#1893": {
    summary:
      "Replaces the paragraph layout engine with a new one written for WASM, touching 38 files and about 13,000 lines. The PR description cites a hyphenation bug (#1720) but the change goes far beyond it, and 4 of 11 CI checks fail, including the layout golden tests. The author has no merged PRs here. It is not reviewable as one PR; the useful part may be the hyphenation fix, which the issue asked for.",
    body: `I rewrote the layout engine from scratch because the current one is too slow and can't hyphenate properly (see #1720).

- New \`layout2\` crate compiled to WASM
- Knuth-Plass line breaking
- Removed the old \`layout\` crate

Some tests fail because the output is *better* than the golden images now. I can update them if you want.`,
  },
  "gridcraft#977": {
    summary:
      "Adds array formulas entered with Ctrl+Shift+Enter, matching the reference app's behaviour, including spilling results into neighbouring cells and the braces shown in the formula bar. The evaluator gains a range-result type, which touches the core of formula evaluation. The review agent found no issues and 140 new evaluator tests pass. The risk is in how existing formulas that return ranges now spill; the author says no existing test changed output.",
    body: `Implements array formulas (#802).

## Behaviour
- Ctrl+Shift+Enter commits a formula as an array formula; the formula bar shows \`{=...}\`
- Results spill into the selected range; editing part of the range shows the reference app's warning
- \`TRANSPOSE\`, \`MMULT\` and \`FREQUENCY\` now return arrays

## Evaluator changes
\`Value\` gains \`Value::Array(Rc<Matrix>)\`. Functions that take ranges accept arrays too. Existing formulas that returned a range now return an array, which is displayed the same way (no golden test changed).

## Tests
140 new tests in \`crates/eval/tests/array.rs\`, including the reference app's documented examples.`,
  },
  "cadcraft#655": {
    summary:
      "Combines three changes: sketch constraints (coincident, parallel, tangent), a dimension tool, and a rewrite of snapping. Constraints and the dimension tool match reference-app features; the snapping rewrite changes default behaviour (snaps now prefer grid over geometry). CI is still running. Reviewing it as one PR would be slow, and the snapping change needs its own discussion.",
    body: `Big one, sorry. This adds:

1. **Sketch constraints**: coincident, parallel, perpendicular, tangent, equal
2. **Dimension tool**: linear, radial, angular
3. **Snapping overhaul**: unified snap engine; grid snaps now win over geometry snaps by default

I needed (3) for (1) to feel right, so they ended up together.`,
  },
  "vectorcraft#1402": {
    summary:
      "Adds a curvature mode to the Pen tool that places smooth Bézier points automatically, like the reference app's Curvature tool. It is a toggle on the existing Pen tool rather than a separate tool, which keeps the toolbar unchanged. The change is self-contained and tested; the author is a regular contributor. Low risk.",
    body: `Adds a **Curvature** mode to the Pen tool (press \`Shift+P\` to toggle).

- Click to add points; handles are computed so the curve passes smoothly through them
- Double-click a point to make it a corner
- Works with existing path editing

Matches the reference app's Curvature tool. I made it a Pen mode instead of a new tool to keep the toolbar as is; happy to split it out if preferred.`,
  },
  "lightcraft#540": {
    summary:
      "Changes the default export colour space from sRGB to Display P3. The reference app defaults to sRGB, and changing the default would make exports look different on sRGB screens and in browsers that ignore embedded profiles. The code change is two lines plus a test. The question is product behaviour, not code quality.",
    body: `Most screens people use for photo work are wide-gamut now. Exporting to sRGB by default clips saturated colours.

This switches the default in \`ExportSettings::default()\` to Display P3. Users can still choose sRGB.`,
  },
  "photocraft#4133": {
    summary:
      "Reports visible seams when using the healing brush on 16-bit images, with the same reproduction steps and screenshots as photocraft#4098, filed a week later. #4098 is open and PR #4102 fixes the tile-edge blending behind it. Nothing in this report adds new information.",
    body: `**Steps**
1. Open a 16-bit TIFF
2. Use the healing brush across a large area
3. Zoom to 200%

**Expected:** smooth result
**Actual:** visible square seams every 256 px

![seams](https://user-images.githubusercontent.com/77120/healing-seams.png)

photocraft 0.14.2, Windows 11, RTX 3060`,
  },
  "effectcraft#811": {
    summary:
      "Adds a turbulence field to the particle emitter, driven by curl noise with strength, scale and speed parameters. The reference app has turbulence only through a third-party plugin, so this is an extra. The implementation is contained in the particle module and adds no dependencies. Opinions lean towards taking it as a small extra.",
    body: `Adds a **Turbulence** field to the particle emitter.

| Param | Range | Default |
|---|---|---|
| Strength | 0–100 | 10 |
| Scale | 1–500 px | 80 |
| Speed | 0–10 | 1 |

Uses curl noise so particles don't bunch up. No new dependencies.`,
  },
  "soundcraft#302": {
    summary:
      "Adds a spectral repair tool that removes clicks and hum by editing the spectrogram directly. The reference app has this only in its advanced edition. It is a large, self-contained feature (21 files) with its own FFT window code. The author is not whitelisted. It could live in core or as a plugin; the classifiers lean towards plugin.",
    body: `Spectral repair: select a region in the spectrogram and attenuate or interpolate it.

- New spectrogram editor view
- Tools: attenuate, interpolate, hum removal (50/60 Hz + harmonics)
- STFT with configurable window (Hann, Blackman-Harris)`,
  },
  "texturecraft#212": {
    summary:
      "A draft PR with node-graph experiments, no description of intent and no activity for 94 days. The author has not replied to two review requests. Nothing in it is ready to review.",
    body: `WIP, don't merge. Playing with a node graph for texture generation.`,
  },
  "deckcraft#760": {
    summary:
      "Adds a thumbnail of the next slide and an elapsed-time timer to presenter view, both of which the reference app's presenter view shows. The change is small (5 files) and limited to the presenter window. The author has 31 merged PRs. Low risk.",
    body: `Presenter view now shows:

- [x] Next slide thumbnail (top right)
- [x] Elapsed timer with pause/reset
- [ ] Speaker notes font size (separate PR)

![presenter view](https://user-images.githubusercontent.com/31337/presenter-view.png)`,
  },
};

export const BATCH_SUMMARY: Record<string, string> = {
  pdfcraft:
    "Twelve small PRs from nine authors, each adding one or two keyboard shortcuts the reference app doesn't have (page rotation, bookmark cycling, focus mode). None changes an existing binding or default behaviour, and all pass CI. They differ only in which keys they bind; labelling them all as small extras keeps them reviewable together.",
  "craft-libs":
    "Nine PRs from seven authors fix the same IME bug: composed text is lost when the text field loses focus mid-composition. #1188 is the smallest fix and the only one with a test; the others patch the same function in slightly different ways, and two fail CI.",
};

const FIRST: Record<string, string> = {
  "Brush engine: pressure curve per stylus": "Lets each stylus keep its own pressure curve instead of one global curve, stored with the device ID.",
  "Add Content-aware scale for layers": "Adds content-aware scaling that keeps marked subjects intact while stretching the background.",
  "Auto layout: support wrap for frames": "Lets auto-layout frames wrap children onto new rows when they run out of width.",
  "Track changes: lost author colours after save": "Reports that tracked changes lose their per-author colours after saving and reopening a document.",
  "Pivot table: add calculated fields": "Adds calculated fields to pivot tables, defined with formulas over other fields.",
  "Add a theme marketplace to the launcher": "Proposes an online theme marketplace inside the launcher, with downloads and ratings.",
  "Node editor: add triplanar projection node": "Adds a triplanar projection node so textures can be mapped without UVs.",
  "Boolean ops fail on self-intersecting paths": "Reports that union and subtract produce empty results when a path crosses itself.",
  "Export cut paths as DXF": "Adds DXF export for cut paths so stencils can go straight to a plotter or laser cutter.",
  "Switch Brazilian Portuguese to pt-BR plural rules": "Switches the Brazilian Portuguese catalogue from European to pt-BR plural rules.",
  "Add adjustment layers to the timeline": "Adds adjustment layers that apply effects to every clip below them on the timeline.",
  "Crash when undoing a Smart Object rasterise": "Reports a crash when undoing a rasterise on a Smart Object that has filters applied.",
  "Prototype mode: smart animate between frames": "Animates matching layers between prototype frames instead of cutting between them.",
  "Replace the layout system with flexbox": "Proposes replacing the immediate-mode layout with a flexbox engine across the library.",
  "Redaction tool: search and redact all matches": "Adds a redaction mode that finds every match of a search term and redacts them in one step.",
  "Fix slide master inheritance for placeholders": "Fixes placeholders that stop following their slide master after the master is edited.",
  "Masking: add luminance range mask": "Adds a mask that selects pixels by brightness range, with feathering.",
  "Fillet tool produces open shells on small radii": "Reports that fillets below 0.1 mm leave open shells that fail export.",
  "Add Select › Sky with on-device model": "Adds Select › Sky, which masks the sky with a small on-device segmentation model.",
  "Default canvas to 4K for new projects": "Changes the default size of new canvases from 1920×1080 to 3840×2160.",
  "Mail merge from CSV": "Adds mail merge that fills fields in a document from rows of a CSV file.",
  "Expressions: add wiggle() helper": "Adds a wiggle() expression helper for random motion with frequency and amplitude.",
  "Conditional formatting lost on paste-special": "Reports that paste-special drops conditional formatting rules from the copied range.",
};

export function fillerText(title: string, repo: string): { summary: string; body: string } {
  const what = title.replace(/^[^:]+:\s*/, "");
  return {
    summary: `${FIRST[title] ?? title + "."} The change is limited to one area and follows the existing module layout. The classifiers see it as close to the reference app's behaviour, but not identical. No risk was flagged beyond normal review.`,
    body: `This PR adds ${what.charAt(0).toLowerCase() + what.slice(1)}.\n\n### Changes\n- Implementation in the existing module\n- Tests for the new behaviour\n\n### Screenshots\nhttps://user-images.githubusercontent.com/10001/${repo}-preview.png`,
  };
}
