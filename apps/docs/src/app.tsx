import { cn, ScrollArea } from "@claralight-design/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

/**
 * The gallery shell: a fixed sidebar over a scrolling page, plus a scheme
 * toggle.
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
}

export interface Section {
  label: string;
  pages: Page[];
}

export interface AppProps {
  sections: Section[];
}

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
  }, [scheme]);

  return [scheme, () => setScheme((s) => (s === "dark" ? "light" : "dark"))];
}

export function App({ sections }: AppProps) {
  const pages = sections.flatMap((s) => s.pages);
  const [route] = useHashRoute(pages[0]?.id ?? "");
  const [scheme, toggleScheme] = useScheme();
  const active = pages.find((p) => p.id === route) ?? pages[0];

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-outline border-r bg-panel">
        <div className="flex items-center justify-between gap-2 px-4 py-3.5">
          <div className="min-w-0">
            <div className="truncate text-title text-foreground">ClaraLight</div>
            <div className="truncate text-caption text-foreground-hint">Design for React</div>
          </div>
          <button
            type="button"
            onClick={toggleScheme}
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
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-6">
          {sections.map((section) => (
            <div key={section.label} className="mb-4">
              <div className="px-2 py-2 text-label text-foreground-hint">{section.label}</div>
              <ul className="flex flex-col gap-0.5">
                {section.pages.map((page) => (
                  <li key={page.id}>
                    <a
                      href={`#/${page.id}`}
                      aria-current={page.id === active?.id ? "page" : undefined}
                      className={cn(
                        "cl-focus block rounded-control px-2 py-1.5",
                        "text-callout no-underline transition-colors duration-[140ms] ease-cl-out",
                        page.id === active?.id
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
      </aside>

      {/*
        The page column is a ClaraLight viewport like any other. `render` keeps
        the landmark on the scroll area's root so `main` is still the page
        column, and the radius is authored to zero because this surface is
        full-bleed against the window rather than a card inside it.
      */}
      <ScrollArea
        render={<main />}
        orientation="vertical"
        wrapperClassName="h-full min-w-0 flex-1"
        className="h-full bg-background"
        style={{ borderRadius: 0 }}
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-8 px-8 py-10">
          <header className="flex flex-col gap-2">
            <h1 className="text-display text-foreground">{active?.title}</h1>
            <p className="max-w-2xl text-body text-foreground-tertiary">{active?.description}</p>
          </header>
          {active?.render()}
        </div>
      </ScrollArea>
    </div>
  );
}
