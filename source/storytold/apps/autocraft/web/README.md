# Triage dashboard frontend

React + TypeScript + Vite + Tailwind. Design: [docs/ui-design.md](../docs/ui-design.md).

```sh
pnpm install
pnpm dev      # http://127.0.0.1:5173, mock API with fixture data
pnpm build    # tsc, then dist/ (no inline scripts or styles; fonts bundled)
VITE_MOCK=1 pnpm build   # the mockup: dist/ on fixture data, no server needed
```

A normal build talks to the dashboard server's JSON API (`src/api/http.ts`), and
the server serves `dist/` behind sign-in. The dev server and the mockup build run
against `createMockApi()` (`src/api/mock/`); pick the signed-in role with
`?as=operator|maintainer|viewer` or the user menu.

A feature is a module in `src/modules/<name>/` listed in `src/registry/index.ts`.
