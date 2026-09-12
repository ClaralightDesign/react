import { cn, ScrollArea } from "@claralight-design/react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Install, type InstallProps } from "./components/install";

/**
 * The gallery shell: a fixed sidebar over a scrolling page, plus a scheme
 * toggle. Below `md` the sidebar is not narrowed — 256px of chrome against a
 * 390px phone leaves nothing for the component being demonstrated — it moves
 * into a drawer behind a bar, and the page column gets the whole width.
 *
 * Routing is a hash string rather than a router dependency. The gallery is a
 * handful of pages with no nested state, so a router would add a dependency and
 * a mental model without buying anything.
 */
export interface Page {
  id: string;
  title: string;
  description: ReactNode;
  render: () => ReactNode;
  /**
   * Present on the component pages, absent on the foundations: `shape` and
   * `tokens` describe the language rather than shipping a registry item, so
   * there is nothing to install for them.
   */
  install?: InstallProps;
}

export interface Section {
  label: string;
  pages: Page[];
}

export interface AppProps {
  sections: Section[];
}

/** Where the sidebar stops being a drawer. Matches Tailwind's `md`. */
const SIDEBAR_QUERY = "(width >= 48rem)";

function useHashRoute(fallback: string): [string, (id: string) => void] {
  const read = useCallback(() => window.location.hash.replace(/^#\/?/, "") || fallback, [fallback]);
  const [route, setRoute] = useState(read);

  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, [read]);

  const navigate = useCallback((id: string) => {
    window.location.hash = `/${id}`;
  }, []);

  return [route, navigate];
}

function useScheme(): [string, () => void] {
  const [scheme, setScheme] = useState<string>("dark");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", scheme === "light");
    root.classList.toggle("dark", scheme === "dark");
    /*
     * The address bar is painted by the browser from `theme-color`, and the
     * static tags in index.html only cover the OS preference. Once the in-page
     * toggle disagrees with the OS, the meta tag has to be corrected or the
     * chrome stays the other scheme's colour above the header.
     */
    document
      .querySelector('meta[name="theme-color"]:not([media])')
      ?.setAttribute("content", scheme === "light" ? "#f9f6ee" : "#191919");
  }, [scheme]);

  return [scheme, () => setScheme((s) => (s === "dark" ? "light" : "dark"))];
}

/**
 * Closes the drawer once the viewport is wide enough to show the sidebar, so a
 * rotation while it is open does not leave the state armed behind the
 * `md:hidden` and pop it back on the way down.
 */
function useCloseAboveBreakpoint(close: () => void) {
  useEffect(() => {
    const media = window.matchMedia(SIDEBAR_QUERY);
    const onChange = () => {
      if (media.matches) close();
    };
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [close]);
}

function SchemeToggle({ scheme, onToggle }: { scheme: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${scheme === "dark" ? "light" : "dark"} scheme`}
      className={cn(
        "cl-press cl-focus shrink-0 rounded-control",
        "border border-outline bg-control px-2 py-1",
        "text-caption text-foreground-tertiary",
        "hover:bg-control-highlight",
      )}
    >
      {scheme === "dark" ? "Dark" : "Light"}
    </button>
  );
}

/**
 * The link list, shared by the desktop sidebar and the drawer so the two cannot
 * drift. Rows are taller on touch: the desktop density would put a 26px target
 * under a finger.
 */
function Nav({ sections, activeId }: { sections: Section[]; activeId?: string }) {
  return (
    <nav className="flex-1 overflow-y-auto overscroll-contain px-2 pb-6">
      {sections.map((section) => (
        <div key={section.label} className="mb-4">
          <div className="px-2 py-2 text-label text-foreground-hint">{section.label}</div>
          <ul className="flex flex-col gap-0.5">
            {section.pages.map((page) => (
              <li key={page.id}>
                <a
                  href={`#/${page.id}`}
                  aria-current={page.id === activeId ? "page" : undefined}
                  className={cn(
                    "cl-focus block rounded-control px-2 py-2.5 md:py-1.5",
                    "text-callout no-underline transition-colors duration-[140ms] ease-cl-out",
                    page.id === activeId
                      ? "bg-selection text-foreground"
                      : "text-foreground-tertiary hover:bg-control hover:text-foreground",
                  )}
                >
                  {page.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Wordmark() {
  return (
    <div className="min-w-0">
      <div className="truncate text-title text-foreground">ClaraLight</div>
      <div className="truncate text-caption text-foreground-hint">Design for React</div>
    </div>
  );
}

export function App({ sections }: AppProps) {
  const pages = sections.flatMap((s) => s.pages);
  const [route] = useHashRoute(pages[0]?.id ?? "");
  const [scheme, toggleScheme] = useScheme();
  const active = pages.find((p) => p.id === route) ?? pages[0];

  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useCloseAboveBreakpoint(closeDrawer);

  // Picking a page is the drawer's only job, so following a link dismisses it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the route is the trigger, not an input.
  useEffect(() => {
    setDrawer(false);
  }, [route]);

  useEffect(() => {
    if (!drawer) return;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDrawer(false);
      toggleRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawer]);

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/*
        The mobile bar. It is a flex sibling of the page column rather than a
        `sticky` element, so the column below it is the only thing that scrolls
        and the bar cannot be pushed off by momentum overscroll.
      */}
      <header
        inert={drawer}
        className={cn(
          "cl-gutter flex shrink-0 items-center gap-3 md:hidden",
          "border-outline border-b bg-panel pt-[env(safe-area-inset-top)]",
        )}
      >
        <button
          type="button"
          ref={toggleRef}
          onClick={() => setDrawer(true)}
          aria-label="Open navigation"
          aria-expanded={drawer}
          className={cn(
            "cl-press cl-focus -ml-1 shrink-0 rounded-control p-2",
            "text-foreground-tertiary hover:bg-control hover:text-foreground",
          )}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <title>Menu</title>
            <path
              d="M2.75 4.75h12.5M2.75 9h12.5M2.75 13.25h12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="flex min-w-0 flex-1 items-baseline gap-2 py-3">
          <span className="shrink-0 text-title text-foreground">ClaraLight</span>
          <span className="truncate text-caption text-foreground-hint">{active?.title}</span>
        </div>
        <SchemeToggle scheme={scheme} onToggle={toggleScheme} />
      </header>

      <aside className="hidden w-64 shrink-0 flex-col border-outline border-r bg-panel md:flex">
        <div className="flex items-center justify-between gap-2 px-4 py-3.5">
          <Wordmark />
          <SchemeToggle scheme={scheme} onToggle={toggleScheme} />
        </div>
        <Nav sections={sections} activeId={active?.id} />
      </aside>

      {/*
        The page column is a ClaraLight viewport like any other. `render` keeps
        the landmark on the scroll area's root so `main` is still the page
        column, and the radius is authored to zero because this surface is
        full-bleed against the window rather than a card inside it.

        `inert` while the drawer is open is what makes the drawer modal: focus
        cannot tab out behind the scrim, and the column underneath it does not
        answer taps that the scrim is meant to swallow.
      */}
      <ScrollArea
        render={<main inert={drawer} />}
        orientation="vertical"
        wrapperClassName="min-h-0 min-w-0 flex-1"
        className="h-full bg-background"
        style={{ borderRadius: 0 }}
      >
        <div
          className={cn(
            "cl-gutter mx-auto flex max-w-4xl flex-col gap-8",
            "pt-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] md:pt-10",
          )}
        >
          <header className="flex flex-col gap-2">
            <h1 className="text-display text-foreground">{active?.title}</h1>
            <p className="max-w-2xl text-body text-foreground-tertiary">{active?.description}</p>
          </header>
          {active?.render()}
          {active?.install ? <Install {...active.install} /> : null}
        </div>
      </ScrollArea>

      {/*
        The drawer stays mounted and is taken out of the tab order with `inert`
        rather than unmounted, so the slide-out is watchable — a conditionally
        rendered panel has nothing left on screen to animate.
      */}
      <div
        inert={!drawer}
        className={cn("fixed inset-0 z-50 md:hidden", drawer ? "" : "pointer-events-none")}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={closeDrawer}
          className={cn(
            "absolute inset-0 cursor-default bg-[rgb(0_0_0/0.5)]",
            "transition-opacity duration-[250ms] ease-cl-out",
            drawer ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          tabIndex={-1}
          className={cn(
            "cl-focus absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col",
            // The drawer is a sheet over arbitrary content, which is exactly
            // what `.cl-frost` is for — panel fill alone is translucent enough
            // that the page underneath reads through it as noise. Only the
            // right edge is on screen, so the other three borders come off.
            "cl-frost border-y-0 border-l-0",
            "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
            "pl-[env(safe-area-inset-left)]",
            "transition-transform duration-[250ms] ease-cl-drawer",
            drawer ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3.5">
            <Wordmark />
            <button
              type="button"
              onClick={() => {
                closeDrawer();
                toggleRef.current?.focus();
              }}
              aria-label="Close navigation"
              className={cn(
                "cl-press cl-focus shrink-0 rounded-control p-2",
                "text-foreground-tertiary hover:bg-control hover:text-foreground",
              )}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <title>Close</title>
                <path
                  d="M4.5 4.5l9 9M13.5 4.5l-9 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <Nav sections={sections} activeId={active?.id} />
        </div>
      </div>
    </div>
  );
}
