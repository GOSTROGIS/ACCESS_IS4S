# ArtCraft source review for IS4S

Reviewed 16 November 2026. Upstream: `storytold/artcraft`, commit
`69f53c2f0358a91a5e35e5a7b3a91677320c3112`.
The reference checkout is `/workspace/vendor-sources/storytold/artcraft`.
It is an upstream source copy, not a deployed IS4S application.

## What the repository contains

`AGENTS.md`, `frontend/README.md`, `frontend/package.json`, the root
`Cargo.toml`, and `_docs/dev_setup.md` establish that the main app is a Rust /
Tauri desktop app with a React, Nx and Vite frontend. Browser components use
Konva and Three.js. A second desktop implementation in
`artcraft-native/Cargo.toml` uses Rust and egui/eframe with native window,
audio, file-dialog and HTTP dependencies. Neither entire desktop app is a
drop-in static-site script.

The frontend has real local drawing, moodboard and scene-editor code under
`frontend/libs/components/`. Its main entry
`frontend/apps/artcraft/app/src/index.tsx` also configures hosted APIs, Tauri
model state, authentication and optional analytics. Copying the full app into
IS4S would bring unrelated service/account behavior and a substantial build.

The root README describes composition, masking, camera/scene setup and image /
video generation workflows. Some model entries are explicitly disabled or
restricted. `ROADMAP.md` lists future goals such as removing dependence on
hosted services; those are not completed capabilities established by this
review. `frontend/libs/components/pagescene/AGENTS.md` contains historical and
in-development specifications alongside behavior notes, so its future-facing
sections are not sufficient evidence that a feature works.

## Educational material selected

Actual written FAQ material lives under
`frontend/libs/markdown-content/src/lib/content/faq/`:

| Source file                         | IS4S practice adaptation                                  |
| ----------------------------------- | --------------------------------------------------------- |
| `text-to-image.md`                   | Clear subject/action brief and candidate comparison        |
| `2d-canvas.md`                       | Arrange the composition before adding detail              |
| `3d-editor.md`                       | Subject placement, framing and related-shot consistency    |
| `edit-image.md`                      | Specify a controlled regional edit and check the whole image |
| `image-to-video.md`                  | Subject, motion, duration and review of an actual output    |
| `ai-image-generation-on-artcraft.md`  | Set criteria, compare results and explain the handover      |

The six source-backed, original IS4S adaptations are exported by
`skills/digital/visual-studio/learning-guides.js`. Every guide records the full
commit, source path and pinned GitHub URL. Its checks and fictional classroom
exercises are original IS4S material. No live generation, video export or
hosted service integration is implied by these exercises.

The upstream FAQ makes strong claims that generation preserves composition
and that only a masked region changes. The IS4S adaptations deliberately ask
learners to inspect the whole result rather than promising either behavior.
Model availability claims were not carried into the guides.

The three `content/tutorials/*.md` entries are metadata-only records with
YouTube links and abstracts. They are not complete written lessons, and this
review did not view or transcribe their videos.

## Reusable browser code candidates

All paths below are relative to the same pinned ArtCraft commit.

| Module / method | Boundary and useful application |
| --- | --- |
| `frontend/libs/components/moodboard/src/lib/canvas/layout/geometry.ts` — `fitViewportToBounds`, `computeVisibleRect`, `panToCenterOn`, `clamp` | Pure viewport / rectangle math; type imports can be removed for a small JavaScript adaptation. Suitable for fitting a local shot frame or diagram. |
| `frontend/libs/components/moodboard/src/lib/canvas/layout/snapping.ts` — `computeSnap` | Pure deterministic edge/centre and optional grid snapping. Suitable for learner-controlled positioning with visible guides. |
| `frontend/libs/components/moodboard/src/lib/canvas/layout/fitToGrid.ts` — `computeFitToGridPatches` | Snaps top-level node positions to a grid. Returns data patches rather than rendering or network work. |
| `frontend/libs/components/moodboard/src/lib/canvas/layout/packCollage.ts` — `computePackPatches` | Packs images into rows while preserving individual aspect ratios; depends only on node/rectangle types and a patch type. |
| `frontend/libs/components/pagescene/src/lib/engine/editor/CameraController.ts` — `getRenderDimensions` | Existing preset sizes for 16:9, 3:2, 2:3, 9:16 and square output. Extracting the presets does not require the Three.js editor. |
| `frontend/libs/components/pagedraw/src/lib/utilities/canvasHelpers.ts` — `normalizeCanvas`, `drawAlphaMask` | Uses browser `OffscreenCanvas`. Useful for a future mask exercise, subject to browser support and a visible fallback. |

No independent crop algorithm was identified in this bounded review. A local
shot planner can use original crop mathematics and clearly attribute any
adapted fit/snapping helpers it actually includes.

`PageDraw.tsx` is not a small standalone utility: it imports React, Zustand,
Konva, model selectors, provider/API types and many workspace UI packages.
`pagedraw/src/lib/adapter.ts` does expose a platform boundary for edit,
inpaint, upload and background-removal jobs. That makes a future isolated
integration possible, but those operations still need a real host adapter
and authorized service access. They should not become pretend working
buttons in the IS4S static site.

## Licensing and branding

The root `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`, and
`frontend/package.json` permit MIT OR Apache-2.0 for the covered code and
associated documentation. For the selected adaptations, choose the MIT option
and ship its complete copyright/permission/warranty text with the adapted
material. The MIT copyright line is:

> Copyright (c) 2026 ArtCraft Team and the ArtCraft contributors

Keep exact source/commit attribution and identify modifications. Preserve the
upstream NOTICE as a useful record of scope and exclusions. An Apache-only
file or a separately licensed dependency would need its own terms checked
before reuse; the root license does not erase file-specific licenses.

The root NOTICE excludes the ArtCraft name, wordmark and logos from its code
license. IS4S can use its own visual identity while retaining source
attribution; it must not relabel an upstream trademark as an ACCESS asset.

The same NOTICE explicitly withholds rights to Nintendo-derived sound
effects, meme images/likenesses, certain skyboxes, the Lumine MMD motion, and
Mixamo animation renders. Do not redistribute these with IS4S. Other bundled
components have their own licenses (including Font Awesome icons, OFL fonts,
ammo.js and Tauri's HTTP fork). These are not needed by the selected guide
adaptations or pure math candidates.

## Checks performed and limits

This was a source inspection. No upstream package installation, build, desktop
launch, account login, model generation or provider service test was run.
The review establishes the documented/code boundaries above, not successful
operation of the upstream application. The generated guide data can be
validated independently by the IS4S browser build and learning UI tests.
