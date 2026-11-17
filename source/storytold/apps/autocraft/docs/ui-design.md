# Triage dashboard: UI design

The design for the new dashboard frontend in `web/`. The data model, routes and access rules stay as in [dashboard-spec.md](dashboard-spec.md); this document covers what the reader sees and how features plug in.

## 1. Look: ArtCraft brand, developer-tool conventions

The dashboard is a working tool for issue and code review, so it follows the conventions of GitHub's PR and issue pages and Linear's issue view: a normal UI sans, compact rows, real tables, 28–32 px controls, hierarchy through weight and colour rather than size. ArtCraft supplies the brand cues, applied quietly.

### From ArtCraft branding (getartcraft.com and the ArtCraft app)

| Cue | Source | Use here |
|---|---|---|
| Logo mark | `frontend/apps/artcraft/app/public/artcraft-icon.svg` (`#4e7bfb`) | Top-left of the sidebar and phone header |
| Body face | getartcraft.com body text is Inter | Inter (bundled with `@fontsource-variable/inter`) for all UI text |
| Mono face | ArtCraft's Geist Mono | Only for code-like values: `repo#number`, diff stats, file paths, SHAs |
| Surfaces | App `--st-bg #121316`, `--st-panel #101014`, controls `#1e1f22`; site paper `#f2f1ee`, ink `#101014` | Dark: chrome `#101014`, content `#141518`, menus `#1e1f22`. Light: chrome `#f2f1ee`, content `#fbfaf8`, menus white |
| Accent | Primary `#2d81ff`, accent ink `#74aaff` | Primary buttons, the recommended option, links, focus ring, selected row |
| Corners | 3 px on pressable controls | 3 px controls, 4–6 px on boxes and menus |
| Icons | Lucide-style line icons, sized 1.15 em by a global rule | Phosphor (`@phosphor-icons/react`), sized the same way |
| Motion | `--ease-out`, short durations, reduced-motion collapse | Same, 120–180 ms |
| Chart hues | Timeline track colours (character, camera, object, audio, keyframe) | Categorical chart slots, re-stepped to pass colour-vision checks on both themes |

Not taken: Archivo display headings, uppercase letter-spaced mono labels, registration marks, dot grids, white filled buttons. Those belong to the marketing site and slow down reading in a dense tool.

### From developer tools

- Sentence-case section headings (12–13 px semibold), no all-caps labels.
- Body 13 px on desktop, titles 15–20 px semibold; one title per screen.
- List rows of two lines (title; `repo#n` · recommendation) at about 52 px, tables with 32–36 px rows, sortable headers with arrows.
- Badges are small rounded pills with a tinted fill for state (Whitelisted, write / no write, role).
- Controls 28–32 px on desktop, at least 44 px on phones.
- Key-value property lists (GitHub's PR sidebar, Linear's properties) for facts and item metadata.

## 2. Tokens

| Group | Tokens (Tailwind name → CSS variable in `web/src/styles/tokens.css`) |
|---|---|
| Surface | `bg` (sidebar, top bar), `panel` (content), `raised` (menus, buttons), `sunken` (inputs) |
| Ink | `ink` with alpha steps: 100 text, 85–90 body, 60 secondary, 45–50 hints; `inv` for text on accent |
| Lines | `line` (8 % dark, 10 % light), `line-strong` (16 % / 20 %) |
| State | `accent` / `accent-ink`, `ok`, `warn`, `bad`, `merged` (purple, GitHub's merged colour) |
| Charts | `c1`–`c5`, validated per theme (lightness band, chroma floor, CVD ΔE ≥ 8, normal-vision ΔE ≥ 15, 3:1 contrast) |
| Type | `2xs` 11, `xs` 12, `sm` 13 (body), `base` 14, `md` 15, `lg` 17 (decision question), `xl` 20 (page and item titles), `2xl` 24 (stat values) |
| Radius | 3 px controls, 4 px boxes, 6 px menus and dialogs, full for pills and avatars |
| Shadow | menus and dialogs only |

## 3. Component rules

- **Buttons**: primary (accent fill) for the one main action; secondary (raised, hairline) for the rest; ghost for icon and toolbar actions. Sentence-case labels.
- **Decision options**: a vertical list of 40 px buttons, label then a short hint, key number on the right. The recommended option uses the accent fill and a "Recommended" pill.
- **Refs** (`photocraft#4127`) are mono. A ref is only ever shown as part of an item (see Items below) or as a mention inside prose.
- **Items**: every issue or PR is drawn by `ItemRef` (`web/src/ui/molecules/ItemRef.tsx`): the kind and state icon, `repo#number` in mono, then the full title. The title wraps; it is never truncated or clamped. The icon (`ItemIcon`) is a plain icon, one text line tall (`1lh`), so it sits with the text also on wrapped titles. Icon, `repo#number` and title together are one link to the item page; with `stretch` the whole row or card is. Every `ItemRef` ends with a GitHub button (`GithubButton`, Phosphor `GithubLogoIcon`, label "Open repo#number on GitHub") that opens the item on GitHub in a new tab. It is a sibling of the item link, never inside it, and sets `relative z-10` itself. Its visible size is small; an invisible hit area makes it 32 px on desktop and 44 px on touch screens without making rows taller. `github={false}` leaves it out. A row that is an item uses `stretch`, so the row is a `relative` container, and the other controls inside it (queue badge, menu, buttons, selects) sit above the link with `relative z-10`. Elements with a tooltip (`title`) or text people copy, such as dates, hints and error messages, count as controls and get `relative z-10` too. A row with no target of its own, such as a GitHub activity row (an action on an item), stretches to its item. A row that is something else (a decision, an agent run) keeps its own target and shows its items as `ItemRef` without `stretch`. Prose mentions such as `#123` in a summary stay inline: `Refs` links the number to the item page and adds a `GithubButton`. Nothing outside `web/src/ui/` builds an item link by hand; `githubItemUrl` in `web/src/lib/links.ts` is the one URL builder. Icon colours follow GitHub: open green, draft grey, merged purple, closed PR red, closed issue purple. The icon is drawn bold at 1.2× the text size. Sticky headers sit above it (`z-20`).
- **Filter chips** are 28 px outlined chips with counts; active chips take an accent tint.
- **Tabs** are segmented text buttons with count pills.
- **Lists** are rows with hairlines, no cards. The selected row gets an accent tint and a 2 px accent bar.
- **Disclosures** are chevron rows with a sentence-case title and a count pill.
- **Empty states** use a muted icon and one line of text.

### Component folders

Shared components in `web/src/ui/` are grouped by size:

- `atoms/`: one element, no data fetching, no app domain types, styled only with tokens. ActionTag, Avatar, Badge, Button, Card, Chip, EmptyState, ErrorLine, GithubButton, Heading, Input, ItemIcon, Kbd, Logo, Pending, PriorityBadge, Select, Textarea, TextLink, Th, TimeAgo, Tooltip.
- `molecules/`: a few atoms doing one job, props only (no queries, no routing except `Link`). Block, CheckRow, ConfirmButton, Dialog, ItemRef, LabelledSelect, Markdown, OpusWorking, Pager, QueueBadge, RadioRow, RateBar, RepoSelect, Segmented, Stat, StepDraft.
- `ActionTag` is a muted pill (Phosphor icon and a word) for one GitHub write. It is never interactive: no border emphasis, no hover. `RadioRow` and `CheckRow` are the rows of a pick-one and a tick list (title, optional tag, content under the title, `CheckRow` also an action at the right edge). The item page's decision answer (`modules/item/ChoiceGroup.tsx`) shows each core action as a bordered card (an accordion that behaves as a radio group: `role=radio`, `aria-checked`, `aria-expanded`); the open card holds the parameters, the extras as `CheckRow`s, the note and the card's own button. Each card has a "GitHub" line (`ActionTag` pills) and an "AutoCraft" line (plain text, from the server's `ChoiceCore.autocraft`). `RadioRow` serves the plain answer of decisions without choices.
- `organisms/`: a self-contained block with layout and behaviour (sorting, the phone switch). It may take domain-shaped props and never fetches. Page, PreapprovalRow, Swimlane.
- `ui/` itself holds helpers that are not components (`cn.ts`, `markdownHtml.ts`).
- `modules/<m>/`: anything bound to one feature's data or wording. Pages compose the folders above and own their queries.

Rules:

- The second module that needs a component moves it to `ui/` in the same change. Modules never import from another module's files.
- Buttons, inputs, selects, textareas, links, pills, cards, table header cells and empty states are not styled by hand outside `ui/`. A class string of more than about six utilities that appears twice becomes a component.
- Phone touch heights (44 px, `max-md:h-11`) are built into the atoms. Callers do not append them.
- Names: the component name is the file name, with one exported component per file. Controlled inputs take `{value, onChange}`; `tone` sets colour, `size` is `sm | md | lg`, `label` is accessible text. Status label and tone maps live in `lib/status.ts`, not in components.
- Items are always drawn with `ItemRef` (or `ItemIcon` plus text on the item page) (see Items above).
- Check `ui/` before writing a component. New shared components are added to the lists above with their folder.
- Hooks shared by modules (`useWrite`, `useUrlState`) live in `web/src/lib/hooks.ts`.

## 4. Layout model

- **Shell**: sidebar, 44 px top bar (breadcrumb, global search, live counters, role badge, theme toggle, user menu), workspace.
- **Sidebar** (220 px, collapses to 52 px with `[`): ArtCraft logo, Pipeline flow (the home page, see dashboard-spec.md), Decisions and Progress, then Insight (Contributors, Classifiers, Cost) and Operator (Repos, Access). A backlog meter at the bottom shows the percentage done and the done split.
- **Workspace**: each view is a row of panels in a `PanelGroup`. Panels are resizable; panels marked `collapsible` fold to a narrow strip with a vertical label. Layouts are saved per user and view (`autocraft:<login>:layout:<view>` in localStorage; the storage adapter is two calls the server can implement later).
- **Phones** (< 768 px): one column. A view either supplies its own phone component (Decisions) or its panels stack top to bottom, skipping those marked `hideOnPhone`. The bottom tab bar holds the primary entries (Now, Next, Needs you, Items). A hamburger button left of the logo opens the sidebar as a left drawer: the same rail component (groups, icons, permission filtering, active state), scrolling on its own, with a scrim; it closes on scrim tap, Escape, close button and route change, traps focus and locks body scroll. Search opens full screen.

## 5. Extensibility

One file lists the feature modules: `web/src/registry/index.ts`. The shell builds nav, routes, panel layouts, permission checks and the shortcut sheet from their declarations. Adding a feature means adding a module there; the shell does not change.

```ts
interface FeatureModule {
  id: string;
  permission: "viewer" | "operator" | `write:${string}`;
  nav?: { label; icon; to; group: "work" | "insight" | "operator"; order; phoneTab?; useBadge? };
  routes: { path; view: { id; title; panels: PanelDef[]; phone?; toolbar? }; permission? }[];
  commands?: { id; keys; label; group }[];   // listed in the "?" sheet
  slots?: { slot: string; order; component }[]; // fill a named place in another view
  prefetch?: (api) => void;
}
```

- **Panels** declare `defaultSize`, `minSize`, `maxSize`, `collapsible`, `startCollapsed`, `hideOnPhone`. Panels of one view share state through the URL (selection, filters) or a small view-local store.
- **Slots** let a module add to another module's screen without editing it. The item page renders the `item.side` slot under its own side panel (for example, a future "audit entries" or "cost for this item" block).
- **Data hooks**: `useQuery(key, api => …)` over the typed `Api` interface (`web/src/api/client.ts`). It refetches after any write. `createHttpApi()` (`web/src/api/http.ts`) implements it over the server's JSON API; `createMockApi()` implements it over deterministic fixtures for the mockup build (`VITE_MOCK=1`).
- **Keyboard**: views register the keys they handle (`useShortcutHelp`), so the `?` sheet lists exactly what works on the current screen.

## 6. Screens

### Decisions inbox

Desktop, three panels: queue (28 %), decision (45 %), discussion (27 %, collapsible).

- **Toolbar**: tabs Waiting / Feedback / Answered with count pills; kind chips with counts; repo picker (multi-select); age picker; "My repos". All filters live in the URL.
- **Queue**: count and one-line summary first ("38 decisions · 20 scope · 8 duplicate … · oldest 3d"), then rows grouped by kind (sticky group headers), then repo, oldest first. A row has three lines: the item title and age (amber from 2 days); the first sentence of the AI summary; the ref, batch size, recommendation, comment count (accent when one of them is yours) and the avatar of whoever is viewing it. Checkboxes select rows for a batch pick.
- **Decision** leads with the item, not the question:
  1. kind pill, ref, age, "kiri-n is viewing · 3m", comment count; the item title (17 px semibold);
  2. **AI summary** (3–6 sentences: what it does, why, what is risky or unclear, how it relates to the reference app), with the model and age;
  3. **Description**: the issue or PR body as GitHub-flavoured Markdown, clamped to about 25 lines (15 on phones) with "Show all";
  4. **Key facts** as a key-value list;
  5. disclosures: Items (batch, with per-item overrides), Context, Comment posted on GitHub, Classifiers, Related.
- **Decision bar**, pinned to the bottom of the decision panel: the question, one line saying what a pick means for this reader, the options in a 2 × 2 grid with the recommendation starred and the number of people who picked it on each, and a note field.
- **Feedback** panel: one list, oldest first, of everything people wrote (avatar, login, age, the text). An entry with a pick also shows the option it suggests and a GitHub permission badge `write` / `no write`, with "Use this answer" for operators on picks by people with write access and "Retract" on your own pick. Below the list, one Feedback box: text and an optional option, at least one of them, sent with the Send button or Ctrl Enter. Feedback is never sent to the pipeline.
- **Recommendation**: when a decision has a recommendation and the model gave a reason, one sentence stands above the options in the Workflow box: "Recommended: <option> — <reason>". The recommended option also carries a "Recommended" pill. With no reason there is no sentence.
- **Duplicate groups** have their own kind, "Duplicates", with its own chip and group header. The item page opens with the group: one card per member, each an `ItemRef` with its role (Keep, Close, Stays open), then the summary. A member's card lists "Does better", "Worth carrying over" and "Adds" as bullets, each point whole; empty lists do not show.
- **Risks**: a Merge? or Close? decision lists the review's risks as bullets under the summary.
- **Answering**: an operator's click or number key answers and moves to the next decision. A small notice, "Answered: <option> <repo#number>" with Undo, shows for about 8 seconds or until the next answer, then goes away. Undo shows only while the decision is undoable (the pipeline has not applied or posted it); `u` undoes the notice's answer. On the Answered tab a row keeps its Undo while the decision is undoable. When the server refuses an Undo, its message shows briefly and the notice goes away.

Description rendering is for untrusted input: raw HTML is dropped, only `http(s)`, `mailto`, relative and anchor links survive, links open in a new tab with `rel="noopener noreferrer nofollow"`, and only GitHub-hosted images load inline. The CSP allows only same-origin images, so the renderer sends images on the hosts the server's image proxy serves (`GET /img`, see the README) through it: lazy-loaded, at most the column's width and 480 px tall, and a click opens the original on GitHub in a new tab. Every other image, and one the proxy refuses, becomes a chip with its alt text that opens the image in a new tab on click.

Phone: one decision per screen. A header strip with the count, summary and a Filter button (filters in a bottom sheet). The page scrolls through title, summary, description, facts, the question with full-width options, feedback (list and box) and the disclosures. A bottom bar holds previous / next, the position ("15 of 38"), the question in one line, a Feedback button that jumps to the box and a button that jumps to the options.

### Answers and feedback (spec: Trust boundary)

| Reader | A pick means | Also sees |
|---|---|---|
| Operator with GitHub write on the repo | the answer; it is actionable | "Use this answer" on every comment that picks an option: answers with that option and credits the person |
| Maintainer, or operator without write on the repo | feedback that may pick an option: shown to everyone with their permission badge and counted in the tally, never acted on | their own pick highlighted, "Retract mine", a note field that saves with Enter |

Operators and maintainers can send feedback, with or without picking an option (rate-limited and audited on the server); viewers are read-only. The top bar shows the reader's role badge (Operator / Maintainer / Viewer), and the line above the options says in words what a pick does. Answered decisions say "by ochre-fox, using kiri-n's answer" when an operator used someone's pick. The mock API enforces the same rules the server will (`decisionAccess` in `web/src/registry/permissions.ts`); in the mock, the user menu has "Mock data: view as" and URLs accept `?as=operator|maintainer|viewer`.

### Item detail

Two panels: the item (68 %) and a collapsible side panel (32 %).

- Header as on GitHub: title with `#number`, a state pill (Open / Merged / Closed), author with avatar, age and repo. The header shows the item's `ItemIcon` with `repo#number`, and a "See in GitHub" button (GitHub icon and text, new tab, 44 px high on phones) among the header actions beside Fast track and Hold merge.
- Properties as a key-value list: author with whitelist tier badge and merged / closed-unmerged counts; size (+/−, file count, S/M/L/XL); checks; mergeable; labels; updated.
- Classifier verdicts as a table, one column per classifier (type, want, reference, topics, reason). Values that disagree with the majority get an amber highlight; the heading says "2 of 3 agree on type". On phones, one block per classifier.
- Timeline with an icon per stage in plain words ("Waiting for a decision", "Merged by the pipeline"), actor and age; the current stage is highlighted.
- Files changed as a table with mono paths, +/− and a proportional bar.
- The description below the properties, rendered like the decision's.
- Side: decisions about the item (status, recommendation or answer, pick tally), linked and duplicate items, CI checks, then the `item.side` slot.

### Item timeline icons

One icon per meaning (Phosphor, regular weight), chosen by `timelineIcon` in `web/src/ui/molecules/timelineIcon.ts`; each icon has an `aria-label` naming its kind. Events AutoCraft produced (pipeline steps, planner, model calls, its checks, its GitHub writes) draw the icon in the accent ink colour; people's events stay neutral. The events read oldest first.

| Meaning | Icon |
| --- | --- |
| GitHub event by a person (opened, pushed, comment, merge) | `GithubLogo` |
| Model call, grouped calls | `Sparkle` |
| Review verdict (Opus, pre-merge, post-merge) | `MagnifyingGlass` |
| Verification | `ShieldCheck` |
| Build, test or lint check, sandbox task | `Wrench` |
| Push by AutoCraft (fix-up, conflict merge, CI fix) | `GitCommit` |
| Merge by AutoCraft | `GitMerge` |
| Comment or review posted by AutoCraft | `ChatText` |
| Label change | `Tag` |
| Assigned, unassigned | `UserPlus`, `UserMinus` |
| Planner state change | `Signpost` |
| Job, other step action | `Gear` |
| Decision asked, answered | `Question`, `CheckCircle` |
| Conversation turn | `ChatsCircle` |

### Progress

- Title with run start, day and repo count.
- Four stat cards: open now (and at run start), done since start (share done by the pipeline), throughput per hour (24 h total), decisions waiting (answered today, links to the inbox).
- Funnel for open items: open → classified → reviewed as bars, then a stacked "routed" bar (taken, held, to close, in a batch, waiting for a decision) with a legend and counts.
- Done since run start: stacked bar (merged by pipeline, closed by pipeline, closed by others) and a small table with counts and shares.
- Throughput: 24 hourly columns in one hue with a dashed average line and a hover readout, drawn at the container's pixel width so labels stay at type size.
- By repo: table with sortable headers (repo, open, classified / reviewed, done, waiting) plus routed mix and a 7-day open-items sparkline. Repo names link to the inbox filtered to that repo. On phones, one compact row per repo.

Charts are hand-written SVG and HTML (no chart library): every bar has a 2 px surface gap, series are identified by legend and direct labels, never colour alone, and hover shows exact values.

## 7. Keyboard

| Key | Action |
|---|---|
| `/` or `Ctrl K` | Search (`repo#123`, `#123`, title or author; arrows and Enter) |
| `?` | Shortcut sheet for the current screen |
| `[` | Collapse or expand the sidebar |
| `g d`, `g p` | Go to decisions, progress |
| `j` / `k` | Next / previous decision |
| `1`–`4` | Answer (operator) or feedback with that option (everyone else) |
| `n` | Focus the note |
| `x` | Check the row for a batch answer; `Esc` clears |
| `u` | Undo the last answer |
| `o` | Open the item page |
| `g a` | Toggle the Answered tab |
| `Ctrl Enter` | Send feedback |

Keys are ignored while typing, except `Esc` and `Ctrl Enter`.

## 8. Accessibility

- Contrast: body text ≥ 4.5:1 on both themes; amber, red and green have separate light-theme steps for that reason. Chart marks ≥ 3:1 against the surface.
- Focus: a 2 px accent-ink outline on every focusable element; all actions reachable by keyboard; Radix handles focus in menus and dialogs.
- Semantics: the queue is a `listbox` with `aria-selected`; tabs, radio groups and toggles carry their ARIA roles and states; option buttons declare `aria-keyshortcuts`; each chart has an `aria-label` and its numbers appear as text beside it.
- State is never colour alone: comments carry a text permission badge and the reader's own pick has a check mark, disagreeing verdicts have a marker and amber text, chart series have legends.
- Phones: targets ≥ 44 px (option buttons 52 px), no horizontal page scroll at 360–390 px.
- `prefers-reduced-motion` collapses all durations.

## 9. Open points

- Claim indicator: the mock records a claim when a decision opens; the server needs a short-lived claim table and a "being looked at" expiry (proposed: 10 minutes).
- Feedback needs the `decision_opinions` and `decision_comments` tables (storing picks and notes) and the summary columns now in `dashboard-spec.md`; the pipeline must write `summary` when it asks a decision.
- Layout persistence is localStorage only; a `PUT /api/me/layout/:key` endpoint would make layouts follow the user.
