# Visual learning studio integration

The studio lives at `skills/digital/visual-studio/index.html`. It is a shared
practice tool rather than a new numbered curriculum lesson. The Digital skill
page and the home page link to it directly. Writing, Communication, and
Creativity and innovation offer links with learning goals specific to each
skill. `EXTRAS` in `build_pages.py` is the source of those skill-page links.

Four learner lessons also offer a contextual practice callout through the
generator's `VISUAL_PRACTICE` mapping. Digital lesson 10 (short presentation)
and Communication lesson 8 (toolbox talk) open the storyboard activity;
Writing lesson 10 (memo and report) opens the brief activity; Creativity and
innovation lesson 10 (sketch an idea) opens the diagram activity. Instructor
and answer pages do not receive these learner callouts.

## Source and authorship boundary

The initial brief, room diagram, storyboard and evidence activities are original
IS4S material. Generated illustrations are identified in the studio's asset
record. They are examples for learning, not documentary photographs or verified
technical instructions. The later shot workshop and six workflow guides adapt
specific Artcraft source and documentation under its MIT option; attribution,
the complete licence, and upstream notices accompany them.

Artcraft was requested as an external reference, but access to
`https://getartcraft.com/` was blocked by the cloud environment's network policy
during the initial implementation. The user's subsequent GitHub organisation
link made the official source available. All 82 public repositories were then
downloaded outside the IS4S checkout, with exact commits recorded. See
`source/storytold/README.md` and `artcraft-review.md` for scope, evidence and the
selected adaptations. The tool library indexes all sources; it must not be
described as 82 apps running inside IS4S. Source attribution remains separate
from the ACCESS visual identity.

## Generated pages and offline packages

`python source/site/build_pages.py` regenerates the home page, skill pages,
lesson pages, and all section downloads. `build_skill()` also writes every
lesson page within that skill, so it must not be treated as an index-only
operation. For a focused change, wrap the generator's `page()` sink with a
selected-output-path filter before calling `build_hub()` and `build_skill()`.
Allow the home page, the four affected skill indexes, and the four contextual
learner pages, and preserve the section-download blocks before making their
archives. Avoid retaining unrelated page changes.

`build_downloads.selected_files('digital')` already includes the complete studio
directory, including local JavaScript, CSS, SVG, and image files. Use relative
asset paths so it remains self-contained. The other three section downloads
retain their own content and send the studio link to the published Digital
page; the studio is not duplicated into every skill pack.

## Validation

- Run the studio's browser interaction checks at desktop and mobile widths.
  Verify state changes, keyboard operation, persistence and reset, and downloaded
  work when those features are present. Test local operation without external
  services.
- Run `python source/check-links.py` after generating the changed pages.
- Run `python -m unittest discover -s source/site -p 'test_*.py'` and
  `python -m unittest discover -s source/lessons -p 'test_*.py'` using the
  `/workspace/.venvs/access-is4s` environment. The site tests include offline
  archive freshness checks, so rebuild affected archives first.
- Confirm the Digital archive contains all studio files and opens correctly
  after extraction. Confirm links from the other skill archives target the
  published studio URL.

The existing Numeracy lesson 21 renderer discrepancy (paired `___` blanks)
was recorded during environment onboarding; distinguish it from regressions
introduced by this work.

## Implementation validation — 16 November 2026

- The two new Chromium regression tests passed. They cover all 12 layout/count
  combinations, brief updates, SVG/text/JSON downloads, storyboard edits,
  timing/preview, review feedback, reload persistence, staged valid imports,
  rejected invalid imports, HTML escaping, and reset isolation.
- All 21 existing lesson tests passed. The complete site suite ran 18 tests;
  its two failures are the same existing Numeracy lesson 21 discrepancy and
  consequent 497/498 counter assertion recorded before these changes.
- The link audit checked 7,229 links with zero missing targets.
- Four section ZIPs were rebuilt. The extracted Digital studio was served
  locally and exercised with all external requests blocked; both generated
  images loaded and the controls redrew the 24-seat SVG. Other section packs
  link to the published Digital studio instead of duplicating its assets.

### Visual review

The target was the existing site's `brand/site.css`, logo and page conventions;
no user-approved new design image was supplied. The 12ui CLI was installed but
its hosted draft service required unavailable authentication/network access.
The implementation follows the existing site rather than claiming fidelity to
an unavailable generated concept. Python Playwright with local Chromium was
used because no Browser/IAB tool was available.

Latest rendered screenshots are under `/workspace/scratch/visual-studio-qa/`:
`desktop-brief.png` (1440px wide), `desktop-story-detail.png`,
`mobile-brief.png` and `mobile-dark-review.png` (390px wide).
Desktop brief, mobile brief/diagram, storyboard and dark review screenshots
were inspected with `view_image`.

Comparison ledger:

| Point | Existing site target and observed result |
| --- | --- |
| Palette | Shared cream, ink, red and gold CSS variables preserved; dark mode inherits site tokens. |
| Branding | Existing badge, breadcrumb and gold masthead rule retained. |
| Typography | Existing Archivo / IBM Plex Sans stacks retained, with explicit readable form/control sizes. |
| Layout | Existing page width and open spacing retained; interactive workspace replaces repeated prose blocks. |
| Asset framing | Generated scenes have a stable 3:2 frame, no tint overlays, alt text and visible attribution. |
| Responsive | All six views fit 390, 768 and 1280px widths without document overflow; desktop reviewed at 1440px. |
| Copy | Visible activity names and controls match their actual behavior. Review corrected a duplicated full stop and an inaccurate route label. |
| Accessibility | Review found and fixed duplicate SVG title/description IDs; labels, keyboard focus, explicit download names and live feedback verified. |

The Storytold follow-up adds real source-derived content and code; it is not a
redesign of every lesson or a full port of all upstream applications. The GitHub
source route resolved the earlier source-review blocker. The separate website
network draft remains unapplied; it is no longer a prerequisite for this source
integration. No deployment or publication has been performed.

## Storytold follow-up verification

All 82 source checkouts match the recorded full commit IDs and have no tracked
upstream edits. The pinned downloader's existing-copy verification passed for
all 82, and a fresh download plus repeat verification passed for the small
`redirect-vocodes` source repository. Histories are shallow; Git LFS media and
submodule recursion are omitted. About 9.8 GB of source is retained outside the
IS4S repository.

The browser suite now contains four passing tests, including framing geometry,
embedded-image SVG exports, framing state in project downloads and imports,
invalid framing settings rejected without losing work, all 82 inventory entries,
skill/search filters and all six guided workflows. Screenshots
`shot-desktop.png`, `shot-mobile.png`, `sources-desktop.png` and
`sources-mobile.png` were captured; desktop framing and mobile sources were
inspected with `view_image`. The shared palette, badge, typography, page width,
open spacing and mobile controls remain consistent with the original site.

Final follow-up checks: the complete site suite ran 20 tests, with only the two
pre-existing Numeracy lesson 21 failures. All four studio browser tests passed.
The link audit checked 7,231 links with zero missing. The rebuilt Digital pack
was extracted, served locally and exercised with external requests blocked:
framing, embedded-image SVG download, six guides and all 82 catalogue records
worked. Default tool discovery also includes CADCraft for Numeracy. The final
desktop framing and mobile Numeracy-filtered library screenshots were inspected.
