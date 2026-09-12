// Built only by scripts/gallery/vite.config.mjs, never the production docs entry.
import { Button, Card, Squircle } from "@claralight-design/react";
import { type CSSProperties, StrictMode, useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

function AuditProbe() {
  const [clicks, setClicks] = useState(0);
  const [variant, setVariant] = useState<"panel" | "control" | "frost">("panel");
  const [smoothing, setSmoothing] = useState<number>();
  const [mounted, setMounted] = useState(true);
  const [refPass, setRefPass] = useState(false);
  const shapeRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const composedRef = useRef<HTMLDivElement>(null);
  const refs = useRef({ child: null as HTMLDivElement | null, attached: 0, cleaned: 0 });
  const childRef = useCallback((element: HTMLDivElement | null) => {
    refs.current.child = element;
    if (element) refs.current.attached++;
    return () => {
      refs.current.child = null;
      refs.current.cleaned++;
    };
  }, []);
  const reportRefs = () => {
    setRefPass(
      mounted
        ? shapeRef.current === document.querySelector("#probe-shape") &&
            cardRef.current === document.querySelector("#probe-card") &&
            composedRef.current === document.querySelector("#probe-child") &&
            refs.current.child === composedRef.current &&
            refs.current.attached > refs.current.cleaned
        : shapeRef.current === null &&
            cardRef.current === null &&
            composedRef.current === null &&
            refs.current.child === null &&
            refs.current.attached === refs.current.cleaned,
    );
  };
  return (
    <main className="flex flex-col gap-4 p-6">
      <h1>Browser regression fixture</h1>
      <div className="flex items-center gap-4">
        {(["sm", "md", "lg"] as const).map((size) => (
          <Button
            key={size}
            id={`press-${size}`}
            size={size}
            onClick={() => setClicks((value) => value + 1)}
          >
            Press {size}
          </Button>
        ))}
        <Button id="disabled-button" disabled onClick={() => setClicks((value) => value + 1)}>
          Disabled
        </Button>
      </div>
      <div className="flex gap-4">
        {(["primary", "secondary", "ghost", "danger"] as const).map((value) => (
          <Button
            key={value}
            id={`disabled-${value}`}
            variant={value}
            disabled
            onClick={() => setClicks((count) => count + 1)}
          >
            Disabled {value}
          </Button>
        ))}
        <Button
          id="disabled-link"
          render={<a href="#unexpected-navigation" />}
          nativeButton={false}
          disabled
          onClick={() => setClicks((value) => value + 1)}
        >
          Disabled link
        </Button>
      </div>
      <output id="click-count">{clicks}</output>
      <div className="flex gap-4">
        <button type="button" id="variant-control" onClick={() => setVariant("control")}>
          Control variant
        </button>
        <button type="button" id="variant-frost" onClick={() => setVariant("frost")}>
          Frost variant
        </button>
        <button type="button" id="variant-panel" onClick={() => setVariant("panel")}>
          Panel variant
        </button>
        <button type="button" id="smoothing-zero" onClick={() => setSmoothing(0)}>
          Explicit circular corners
        </button>
        <button type="button" id="report-refs" onClick={reportRefs}>
          Report refs
        </button>
        <button
          type="button"
          id="unmount"
          onClick={() => {
            setMounted(false);
            setRefPass(false);
          }}
        >
          Unmount
        </button>
        <output id="ref-result">{String(refPass)}</output>
      </div>
      <div id="scope" className="dark flex gap-6">
        {mounted && (
          <>
            <Squircle
              id="probe-shape"
              radius="medium"
              ref={shapeRef}
              smoothing={smoothing}
              className="border border-outline bg-panel shadow-panel"
              style={{ width: 180, height: 120, padding: 8 }}
            >
              Squircle ref and inline style
            </Squircle>
            <Card
              id="probe-card"
              ref={cardRef}
              variant={variant}
              style={{ width: 180, height: 120, padding: 8 }}
            >
              Card ref and variant
            </Card>
            <Squircle
              radius="medium"
              ref={composedRef}
              asChild
              style={{ padding: 8 } as CSSProperties}
            >
              <div
                id="probe-child"
                ref={childRef}
                className="border border-outline bg-panel"
                style={{ width: 180, height: 120 }}
              >
                Composed child ref and styles
              </div>
            </Squircle>
          </>
        )}
      </div>
    </main>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing fixture root");
createRoot(container).render(
  <StrictMode>
    <AuditProbe />
  </StrictMode>,
);
