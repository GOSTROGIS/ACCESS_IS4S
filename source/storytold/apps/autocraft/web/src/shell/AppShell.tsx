import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { ScopePicker, useStalePickCleared } from "./ScopePicker";
import { useProjectInUrl } from "../api/scope";
import { Link, Navigate, NavLink, Route, Routes, matchPath, useLocation, useNavigate, useParams } from "react-router-dom";
import { Dialog, DropdownMenu } from "radix-ui";
import { SignOutIcon, MonitorIcon, MoonIcon, SidebarSimpleIcon, ListIcon, CaretRightIcon, MagnifyingGlassIcon, SunIcon, KeyboardIcon, XIcon, CheckIcon, ChartBarIcon, GearSixIcon, InfoIcon, LinkBreakIcon, LinkIcon, HeartbeatIcon, CloudIcon, CloudCheckIcon, CloudSlashIcon } from "@phosphor-icons/react";
import { modules } from "../registry";
import { can, roleLabel } from "../registry/permissions";
import type { NavEntry, Permission, RouteDef } from "../registry/types";
import { useUser } from "./UserContext";
import { Workspace } from "./Workspace";
import { useIsPhone } from "./useMedia";
import { useTheme, type ThemePref } from "./theme";
import { usePref } from "./layoutStorage";
import { useHotkeys, useActiveShortcuts } from "./keyboard";
import { REPORTS, SETTINGS, openEntries, type Entry } from "../modules/hub/entries";
import { SearchBox } from "./SearchBox";
import { Avatar } from "../ui/atoms/Avatar";
import { Kbd } from "../ui/atoms/Kbd";
import { Logo } from "../ui/atoms/Logo";
import { Badge } from "../ui/atoms/Badge";
import { cn } from "../ui/cn";
import { useApi, useQuery } from "../api/client";
import { HealthMenu } from "../ui/organisms/HealthMenu";
import { useLiveStatus, type LiveStatus } from "../api/live";
import { MAIN_CI_DOT, MAIN_CI_LABEL } from "../ui/atoms/MainCiBadge";
import type { MainCiState } from "../api/types";
import { zoneName } from "../lib/format";
import { UnlinkDiscordDialog } from "./UnlinkDiscord";
import { LinkDiscordDialog } from "./LinkDiscord";

// Mockup builds only; a normal build drops this branch and the fixture data with it.
const MockRoleMenu = import.meta.env.VITE_MOCK === "1" ? lazy(() => import("../api/mock/MockRoleMenu")) : null;

// The rail is laid out here by path, so a module only declares its own entry. A path no module
// registers (a page the reader's role cannot open) is left out.
// The main list is laid out here by path, so a module only declares its own entry. A path no module
// registers (a page the reader's role cannot open) is left out. Reports and Settings follow as collapsible sections.
const MAIN = ["/", "/needs", "/items", "/next", "/security"];
const PHONE_TABS = ["/", "/needs", "/items", "/next"];

export function AppShell() {
  useStalePickCleared();
  const user = useUser();
  const phone = useIsPhone();
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const [railOpen, setRailOpen] = usePref(user.login, "rail-open", true);
  const [help, setHelp] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const visible = useMemo(() => modules.filter((m) => can(user, m.permission)), [user]);
  const entries = visible.flatMap((m) => (m.nav ? [m.nav] : []));
  const rail = [{ label: "", entries: MAIN.flatMap((p) => entries.filter((e) => e.to === p)) }];
  const routes = visible.flatMap((m) => m.routes);
  const hiddenPaths = useMemo(() => modules.filter((m) => !can(user, m.permission)).flatMap((m) => m.routes.map((r) => ({ path: r.path, permission: m.permission }))), [user]);

  useHotkeys({
    "/": () => (phone ? setSearchOpen(true) : document.getElementById("global-search")?.focus()),
    "mod+k": () => (phone ? setSearchOpen(true) : document.getElementById("global-search")?.focus()),
    "?": () => setHelp(true),
    "[": () => setRailOpen(!railOpen),
    "g h": () => navigate("/"),
    "g q": () => navigate("/next"),
    "g d": () => navigate("/needs"),
    "g i": () => navigate("/items"),
    "g p": () => navigate("/progress"),
  });

  const content = (
    <Routes>
      {routes.map((r) => (
        <Route key={r.path} path={r.path} element={r.path === "/" ? <OldFlowLink route={r} /> : <RouteView route={r} />} />
      ))}
      <Route path="item/:repo/:number" element={<ItemRedirect />} />
      <Route path="decisions/*" element={<RedirectTo from="/decisions" to="/needs/decisions" />} />
      <Route path="decisions" element={<RedirectTo to="/needs" />} />
      <Route path="queue/merge" element={<RedirectTo to="/next/merge" />} />
      <Route path="queue/*" element={<RedirectTo to="/next/steps" />} />
      <Route path="queue" element={<RedirectTo to="/next" />} />
      <Route path="work" element={<RedirectTo to="/next/steps" />} />
      <Route path="merge-queue" element={<RedirectTo to="/next/merge" />} />
      <Route path="github-activity" element={<RedirectTo to="/activity" search="?kinds=write" />} />
      <Route path="*" element={<NoRoute hidden={hiddenPaths} />} />
    </Routes>
  );

  if (phone) {
    return (
      <div className="flex h-full flex-col bg-panel">
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-bg pl-1 pr-1.5">
          <button id="nav-toggle" aria-label="Open navigation" onClick={() => setNavOpen(true)} className="flex size-11 shrink-0 items-center justify-center text-ink/70">
            <ListIcon className="text-[20px]" />
          </button>
          <NavLink to="/" aria-label="ACCESS Automation home" className="flex size-11 shrink-0 items-center justify-center"><Logo size={20} /></NavLink>
          <div className="flex-1" />
          <MainCiDots />
          <LiveDot />
          <HealthMenu />
          <button aria-label="Search" onClick={() => setSearchOpen(true)} className="flex size-11 items-center justify-center text-ink/70">
            <MagnifyingGlassIcon className="text-[18px]" />
          </button>
          <UserMenu theme={theme} setTheme={setTheme} onHelp={() => setHelp(true)} />
        </header>
        <main className="min-h-0 flex-1">{content}</main>
        <PhoneTabs rail={rail} />
        <NavDrawer open={navOpen} onOpenChange={setNavOpen} rail={rail} />
        <Dialog.Root open={searchOpen} onOpenChange={setSearchOpen}>
          <Dialog.Portal>
            <Dialog.Content className="fixed inset-0 z-50 flex flex-col bg-panel animate-fadeIn" aria-describedby={undefined}>
              <Dialog.Title className="sr-only">Search</Dialog.Title>
              <div className="flex items-start gap-1 border-b border-line p-2">
                <SearchBox autoFocus onPick={() => setSearchOpen(false)} fullscreen />
                <Dialog.Close className="flex size-11 shrink-0 items-center justify-center text-ink/70" aria-label="Close search">
                  <XIcon />
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-bg">
      <aside className={cn("flex shrink-0 flex-col border-r border-line bg-bg transition-[width] duration-base ease-out", railOpen ? "w-[220px]" : "w-[52px]")}>
        <div className={cn("flex h-11 shrink-0 items-center px-4", !railOpen && "justify-center px-0")}>{railOpen ? <Wordmark /> : <Logo size={20} />}</div>
        {railOpen && (
          <div className="px-2 pb-2">
            <ScopePicker />
          </div>
        )}
        <RailNav rail={rail} open={railOpen} className="flex-1" />
        <div className="px-2 pb-1">
          <FootLink to="/about" icon={InfoIcon} label="How it works" open={railOpen} />
        </div>
        <div className={cn("flex items-center border-t border-line p-2", !railOpen && "justify-center")}>
          <button onClick={() => setRailOpen(!railOpen)} className="flex size-7 items-center justify-center text-ink/50 hover:bg-ink/[0.06] hover:text-ink" aria-label={railOpen ? "Collapse sidebar" : "Expand sidebar"} title="Toggle sidebar  [">
            <SidebarSimpleIcon className="text-[15px]" />
          </button>
          {railOpen && (
            <button onClick={() => setHelp(true)} className="ml-auto flex h-7 items-center gap-2 px-2 text-xs text-ink/50 hover:bg-ink/[0.06] hover:text-ink">
              Shortcuts <Kbd keys="?" />
            </button>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-bg pl-4 pr-2">
          <div className="mx-auto w-full max-w-[440px]">
            <SearchBox />
          </div>
          <MainCiDots />
          <LiveDot />
          <HealthMenu />
          <UserMenu theme={theme} setTheme={setTheme} onHelp={() => setHelp(true)} />
        </header>
        <main className="min-h-0 flex-1 bg-panel">{content}</main>
      </div>
      <ShortcutSheet open={help} onOpenChange={setHelp} />
    </div>
  );
}

function RouteView({ route }: { route: RouteDef }) {
  const params = useParams();
  const user = useUser();
  if (route.permission && !can(user, route.permission)) return <div className="p-8 text-ink/60">You can't open this page.</div>;
  const view = <Workspace view={route.view} props={{ params, user }} />;
  return route.scoped ? <ProjectList>{view}</ProjectList> : view;
}

function ProjectList({ children }: { children: ReactNode }) {
  useProjectInUrl();
  return children;
}

function Wordmark() {
  return (
    <NavLink to="/" className="flex items-center gap-2" aria-label="ACCESS Automation home">
      <Logo size={20} />
      <span className="text-sm font-semibold">ACCESS Automation</span>
    </NavLink>
  );
}

function RailLink({ entry, open, tall }: { entry: NavEntry; open: boolean; tall?: boolean }) {
  const count = entry.useBadge?.();
  const cls = (isActive: boolean) =>
    cn(
      "relative flex items-center gap-2 rounded px-2 text-sm",
      tall ? "h-11" : "h-7",
      "text-ink/70 transition-colors duration-fast hover:bg-ink/[0.06] hover:text-ink",
      isActive && "bg-ink/[0.08] font-medium text-ink",
      !open && "justify-center px-0",
    );
  const inner = (
    <>
      <entry.icon className="text-[15px] opacity-80" />
      {open && <span className="flex-1 truncate">{entry.label}</span>}
      {open && count !== undefined && count > 0 && <span className="num text-xs text-ink/50">{count}</span>}
      {!open && count !== undefined && count > 0 && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent" />}
    </>
  );
  return (
    <NavLink to={entry.to} end={entry.to === "/"} title={open ? undefined : entry.label} className={({ isActive }) => cls(isActive)}>
      {inner}
    </NavLink>
  );
}

type RailGroup = { label: string; entries: NavEntry[] };

/** The nav rail: the desktop sidebar and the phone drawer both render this. */
function RailNav({ rail, open, className, tall }: { rail: RailGroup[]; open: boolean; className?: string; tall?: boolean }) {
  return (
    <nav className={cn("overflow-y-auto px-2 pb-3 pt-1", className)} aria-label="Main">
      {rail.map((g) => (
        <div key={g.label} className="mb-1">
          {g.entries.map((n) => (
            <RailLink key={n.to} entry={n} open={open} tall={tall} />
          ))}
        </div>
      ))}
      <RailSection id="reports" label="Reports" icon={ChartBarIcon} to="/reports" entries={REPORTS} open={open} tall={tall} />
      <RailSection id="settings" label="Settings" icon={GearSixIcon} to="/settings" entries={SETTINGS} open={open} tall={tall} />
    </nav>
  );
}

/** A collapsible group of sub-items; the choice is remembered. The collapsed rail shows the section as one icon. */
function RailSection({ id, label, icon: Icon, to, entries, open, tall }: { id: string; label: string; icon: typeof GearSixIcon; to: string; entries: Entry[]; open: boolean; tall?: boolean }) {
  const user = useUser();
  const { pathname } = useLocation();
  const items = openEntries(user, entries);
  const here = items.some((e) => pathname === e.to || pathname.startsWith(`${e.to}/`)) || pathname === to;
  const [expanded, setExpanded] = usePref(user.login, `rail-section-${id}`, false);
  const row = cn("flex items-center gap-2 rounded px-2 text-sm text-ink/70 hover:bg-ink/[0.06] hover:text-ink", tall ? "h-11" : "h-7");
  if (!open)
    return (
      <NavLink to={to} title={label} className={cn(row, "justify-center px-0", here && "bg-ink/[0.08] text-ink")}>
        <Icon className="text-[15px] opacity-80" />
      </NavLink>
    );
  const show = expanded || here;
  return (
    <div className="mt-1">
      <button onClick={() => setExpanded(!show)} aria-expanded={show} className={cn(row, "w-full text-left")}>
        <Icon className="text-[15px] opacity-80" />
        <span className="flex-1">{label}</span>
        <CaretRightIcon className={cn("text-[11px] text-ink/40 transition-transform duration-fast", show && "rotate-90")} />
      </button>
      {show && (
        <div className="ml-[15px] border-l border-line pl-1.5">
          {items.map((e) => (
            <NavLink key={e.to} to={e.to} className={({ isActive }) => cn("flex items-center rounded px-2 text-sm text-ink/65 hover:bg-ink/[0.06] hover:text-ink", tall ? "h-10" : "h-[26px]", isActive && "bg-ink/[0.08] font-medium text-ink")}>
              {e.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

/** Phone: the rail in a left drawer. Radix Dialog supplies the focus trap, Escape, scroll lock and focus return. */
function NavDrawer({ open, onOpenChange, rail }: { open: boolean; onOpenChange: (o: boolean) => void; rail: RailGroup[] }) {
  const { pathname } = useLocation();
  useEffect(() => onOpenChange(false), [pathname, onOpenChange]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 animate-fadeIn" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-r border-line bg-bg pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] animate-fadeIn" aria-describedby={undefined} onCloseAutoFocus={(e) => { e.preventDefault(); document.getElementById("nav-toggle")?.focus(); }}>
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <div className="flex h-12 shrink-0 items-center justify-between pl-4 pr-1.5">
            <Wordmark />
            <Dialog.Close className="flex size-11 items-center justify-center text-ink/70" aria-label="Close navigation">
              <XIcon />
            </Dialog.Close>
          </div>
          <div className="px-2 pb-2">
            <ScopePicker onPicked={() => onOpenChange(false)} />
          </div>
          <RailNav rail={rail} open tall className="min-h-0 flex-1 overscroll-contain" />
          <div className="border-t border-line px-2 py-1">
            <FootLink to="/about" icon={InfoIcon} label="How it works" open tall />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PhoneTabs({ rail }: { rail: RailGroup[] }) {
  const all = rail.flatMap((g) => g.entries);
  const tabs = PHONE_TABS.flatMap((p) => all.filter((e) => e.to === p));
  return (
    <nav aria-label="Primary" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }} className="grid shrink-0 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)]">
      {tabs.map((n) => (
        <PhoneTab key={n.to} entry={n} />
      ))}
    </nav>
  );
}

function PhoneTab({ entry }: { entry: NavEntry }) {
  const count = entry.useBadge?.();
  return (
    <NavLink to={entry.to} end={entry.to === "/"} className={({ isActive }) => cn("relative flex h-14 flex-col items-center justify-center gap-0.5 text-2xs font-medium text-ink/55", isActive && "text-accent-ink")}>
      <span className="relative">
        <entry.icon className="text-[20px]" />
        {count !== undefined && count > 0 && <span className="num absolute -right-3.5 -top-1 rounded-full bg-accent px-1 text-[10px] font-semibold leading-[14px] text-white">{count}</span>}
      </span>
      {entry.label}
    </NavLink>
  );
}

/** Flowchart links from before the Now page (`/?node=review&repo=x`) open the flowchart; the query stays. */
function OldFlowLink({ route }: { route: RouteDef }) {
  const loc = useLocation();
  if (new URLSearchParams(loc.search).has("node")) return <Navigate to={`/flow${loc.search}`} replace />;
  return <RouteView route={route} />;
}

/** The old two-panel item page path opens the item page. */
function ItemRedirect() {
  const { repo, number } = useParams();
  const loc = useLocation();
  return <Navigate to={`/items/${repo}/${number}${loc.search}`} replace />;
}

/** Sends an old path to its new place. `from` is the prefix to swap, so `/decisions/a/1` becomes `/needs/decisions/a/1`; `search` replaces the query. */
function RedirectTo({ to, from, search }: { to: string; from?: string; search?: string }) {
  const loc = useLocation();
  const tail = from ? loc.pathname.slice(from.length) : "";
  return <Navigate to={`${to}${tail}${search ?? loc.search}`} replace />;
}

const THEMES: { v: ThemePref; icon: typeof SunIcon; label: string }[] = [
  { v: "dark", icon: MoonIcon, label: "Dark" },
  { v: "light", icon: SunIcon, label: "Light" },
  { v: "system", icon: MonitorIcon, label: "System" },
];

const menuCls = "z-50 min-w-[220px] rounded-md border border-line-strong bg-raised p-1 shadow-[0_12px_32px_rgba(0,0,0,0.28)] animate-rise";
const itemCls = "flex h-8 cursor-default items-center gap-2.5 rounded px-2 text-sm outline-none data-[highlighted]:bg-ink/[0.07]";
const labelCls = "px-2 pb-1 pt-2 text-2xs font-medium text-ink/45";

function UserMenu({ theme, setTheme, onHelp }: { theme: ThemePref; setTheme: (t: ThemePref) => void; onHelp?: () => void }) {
  const user = useUser();
  const api = useApi();
  const navigate = useNavigate();
  const discord = useQuery("discord-account", (a) => a.discord.account());
  const [unlinking, setUnlinking] = useState(false);
  const [linking, setLinking] = useState(false);
  return (
    <>
    <LinkDiscordDialog open={linking} linked={!!discord.data?.linked} onClose={() => setLinking(false)} />
    <UnlinkDiscordDialog open={unlinking} onClose={() => setUnlinking(false)} onDone={() => discord.refetch()} />
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex size-9 items-center justify-center rounded-full hover:bg-ink/[0.06]" aria-label={`Signed in as ${user.login}`}>
        <Avatar login={user.login} size={24} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={cn(menuCls, "w-[248px]")}>
          <div className="flex items-center gap-2.5 px-2 pb-2 pt-1.5">
            <Avatar login={user.login} size={32} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{user.login}</div>
              <div className="flex items-center gap-1.5 text-xs text-ink/55">
                <Badge tone={user.role === "operator" ? "accent" : "neutral"}>{roleLabel(user)}</Badge>
                <span>write on {user.writeRepos.length} repos</span>
              </div>
              <div className="text-xs text-ink/55">Times in {zoneName()}</div>
            </div>
          </div>
          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-line" />
          <DropdownMenu.Label className={labelCls}>Theme</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePref)}>
            {THEMES.map((t) => (
              <DropdownMenu.RadioItem key={t.v} value={t.v} className={itemCls}>
                <t.icon className="text-ink/55" />
                <span className="flex-1">{t.label}</span>
                <DropdownMenu.ItemIndicator>
                  <CheckIcon className="text-accent-ink" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          {MockRoleMenu && (
            <Suspense fallback={null}>
              <MockRoleMenu itemCls={itemCls} labelCls={labelCls} />
            </Suspense>
          )}
          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-line" />
          <DropdownMenu.Item onSelect={() => navigate("/about")} className={itemCls}>
            <InfoIcon className="text-ink/55" /> How it works
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => onHelp?.()} className={itemCls}>
            <KeyboardIcon className="text-ink/55" /> <span className="flex-1">Keyboard shortcuts</span> <Kbd keys="?" />
          </DropdownMenu.Item>
          {discord.data?.configured && (
            <DropdownMenu.Item onSelect={() => setLinking(true)} className={itemCls}>
              <LinkIcon className="text-ink/55" /> Link Discord
            </DropdownMenu.Item>
          )}
          {discord.data?.linked && (
            <DropdownMenu.Item onSelect={() => setUnlinking(true)} className={itemCls}>
              <LinkBreakIcon className="text-ink/55" /> Unlink Discord
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item onSelect={() => void api.signOut()} className={itemCls}>
            <SignOutIcon className="text-ink/55" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    </>
  );
}

function ShortcutSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const local = useActiveShortcuts();
  const global = modules.flatMap((m) => m.commands ?? []);
  const all = [
    { id: "search", keys: "/", label: "Search", group: "Anywhere" },
    { id: "help", keys: "?", label: "Keyboard shortcuts", group: "Anywhere" },
    { id: "rail", keys: "[", label: "Toggle sidebar", group: "Anywhere" },
    ...global,
    ...local,
  ];
  const groups = [...new Set(all.map((c) => c.group))];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 animate-fadeIn" />
        <Dialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-lg border border-line-strong bg-raised shadow-[0_24px_64px_rgba(0,0,0,0.35)] animate-rise" aria-describedby={undefined}>
          <div className="flex h-11 items-center justify-between border-b border-line px-4">
            <Dialog.Title className="text-sm font-semibold">Keyboard shortcuts</Dialog.Title>
            <Dialog.Close className="flex size-7 items-center justify-center text-ink/50 hover:text-ink" aria-label="Close">
              <XIcon />
            </Dialog.Close>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 p-4">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-1 text-xs font-semibold text-ink/55">{g}</div>
                {all
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <div key={c.id} className="flex h-7 items-center justify-between gap-3 text-sm">
                      <span className="text-ink/80">{c.label}</span>
                      <Kbd keys={c.keys} />
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A page this reader's role doesn't open says so; anything else is unknown. */
function NoRoute({ hidden }: { hidden: { path: string; permission: Permission }[] }) {
  const { pathname } = useLocation();
  const found = hidden.find((h) => matchPath({ path: `/${h.path}`, end: false }, pathname));
  const text = !found ? "Nothing here." : found.permission === "staff" ? "Operators and maintainers only." : "Operators only.";
  return <div className="p-8 text-ink/60">{text}</div>;
}


const LIVE: Record<LiveStatus, [label: string, icon: typeof CloudIcon, color: string]> = {
  open: ["Live", CloudCheckIcon, "text-ok"],
  connecting: ["Reconnecting", CloudIcon, "text-warn"],
  down: ["Offline", CloudSlashIcon, "text-bad"],
};

/** The state of the server's event stream, as an icon and a tooltip. */
function LiveDot() {
  const [label, Icon, color] = LIVE[useLiveStatus()];
  return <Icon role="img" aria-label={label} className={cn("mx-1 shrink-0 text-[17px]", color)}><title>{label}</title></Icon>;
}

const CI_ORDER: MainCiState[] = ["green", "red", "running", "optional"];

/** Main CI of every repo at a glance: one dot and count per state, linking to the Main CI page. */
function MainCiDots() {
  const { data } = useQuery("progress", (api) => api.progress());
  const summary = data?.mainCi;
  if (!summary) return null;
  const shown = CI_ORDER.filter((s) => s === "green" || summary[s] > 0);
  return (
    <Link to="/main-ci" className="flex shrink-0 items-center gap-1.5 px-1 text-xs text-ink/60 hover:text-ink" aria-label="Main CI" title="Main CI">
      <HeartbeatIcon className="text-sm" />
      {shown.map((s) => (
        <span key={s} className="flex items-center gap-0.5" title={`${MAIN_CI_LABEL[s]}: ${summary[s]}`}>
          <span className={cn("size-1.5 rounded-full", MAIN_CI_DOT[s])} />
          <span className="num font-medium text-ink">{summary[s]}</span>
        </span>
      ))}
    </Link>
  );
}

function FootLink({ to, icon: Icon, label, open, tall }: { to: string; icon: typeof GearSixIcon; label: string; open: boolean; tall?: boolean }) {
  return (
    <NavLink to={to} title={open ? undefined : label} className={({ isActive }) => cn("flex items-center gap-2 rounded px-2 text-sm text-ink/60", tall ? "h-11" : "h-7", " hover:bg-ink/[0.06] hover:text-ink", isActive && "bg-ink/[0.08] font-medium text-ink", !open && "justify-center px-0")}>
      <Icon className="text-[15px] opacity-80" />
      {open && label}
    </NavLink>
  );
}
