import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Tooltip } from "radix-ui";
import { disableGlobalCursorStyles } from "react-resizable-panels";
import "./styles/app.css";
import { ApiContext, type Api } from "./api/client";
import { createHttpApi } from "./api/http";
import { eventSource, LiveProvider, mockSource } from "./api/live";
import type { User } from "./api/types";
import { UserContext } from "./shell/UserContext";
import { AppShell } from "./shell/AppShell";
import { initTheme } from "./shell/theme";
import { modules } from "./registry";
import { preloadAll, preloadRoute } from "./registry/lazyView";
import { setRepoOwners } from "./lib/links";

initTheme();
// The page's own chunks load beside the sign-in request, not after it.
preloadRoute(modules, window.location.pathname);
preloadAll(modules);
// The panels library would set the drag cursor with an injected <style>, which
// the server's CSP refuses; the resize handles set their own cursor.
disableGlobalCursorStyles();

// `VITE_MOCK=1` builds the fake-data mockup, which runs without a server.
const loadApi = async (): Promise<Api> =>
  import.meta.env.VITE_MOCK === "1" ? (await import("./api/mock/realStore").then((m) => m.loadRealData()), (await import("./api/mock/scoped")).scopedMockApi((await import("./api/mock/mockApi")).createMockApi())) : createHttpApi();

// The cache holds server views only and is never written locally. Retries are off: a failed view
// shows its error, and the next change event or focus refetches it.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function App({ api }: { api: Api }) {
  const source = useMemo(() => (import.meta.env.VITE_MOCK === "1" ? mockSource(api.subscribe) : eventSource()), [api]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void api.me().then(setUser, (e: Error) => setError(e.message)), [api]);
  // Links read the owners when they render, so the app waits for them (a failed read leaves storytold's default).
  const [ownersLoaded, setOwnersLoaded] = useState(false);
  useEffect(() => void api.repoOwners().then(setRepoOwners, () => {}).finally(() => setOwnersLoaded(true)), [api]);
  if (error) return <div className="p-8 text-ink/60">The dashboard could not load: {error}</div>;
  if (!user || !ownersLoaded) return null;
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={queryClient}>
        <LiveProvider source={source}>
          <UserContext.Provider value={user}>
            <Tooltip.Provider delayDuration={300}>
              <BrowserRouter>
                <AppShell />
              </BrowserRouter>
            </Tooltip.Provider>
          </UserContext.Provider>
        </LiveProvider>
      </QueryClientProvider>
    </ApiContext.Provider>
  );
}

void loadApi().then((api) =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App api={api} />
    </StrictMode>,
  ),
);
