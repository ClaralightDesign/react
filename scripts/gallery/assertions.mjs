export function createAssertions() {
  const failures = [];
  let checks = 0;
  return {
    ok(label, condition, detail = "") {
      checks++;
      if (!condition) failures.push(label);
      console.log(`${condition ? "  ok  " : " FAIL "} ${label} ${detail}`);
    },
    section(name) {
      console.log(`\n${name}`);
    },
    fail(error) {
      failures.push(`threw: ${error.stack ?? error}`);
    },
    finish() {
      console.log(
        failures.length
          ? `\n${failures.length} of ${checks} FAILED:\n  - ${failures.join("\n  - ")}`
          : `\nALL ${checks} CHECKS PASS`,
      );
      return failures.length ? 1 : 0;
    },
  };
}

// Parse browser-serialized sRGB directly; canvas quantizes translucent colors.
export function parseColor(raw) {
  const str = raw?.trim() ?? "";
  const hex = /^#([0-9a-f]{3,8})$/i.exec(str);
  if (hex) {
    const h = hex[1];
    const value = h.length <= 4 ? [...h].map((c) => c + c).join("") : h;
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16),
      a: value.length === 8 ? Number.parseInt(value.slice(6, 8), 16) / 255 : 1,
    };
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(str);
  if (!fn) return null;
  const p = fn[1]
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}

export const same = (a, b, channels = 1, alpha = 0.006) =>
  !!a &&
  !!b &&
  Math.abs(a.r - b.r) <= channels &&
  Math.abs(a.g - b.g) <= channels &&
  Math.abs(a.b - b.b) <= channels &&
  Math.abs(a.a - b.a) <= alpha;

export function pathGeometry(clip = "") {
  const start = /path\("M ([\d.]+) ([\d.]+)/.exec(clip);
  const arc = / A ([\d.]+) ([\d.]+) /.exec(clip);
  return { startX: start ? Number(start[1]) : null, arcRadius: arc ? Number(arc[1]) : null };
}

/** Ignore legal minifier spellings, but not numeric/token changes. */
export function sameCss(a = "", b = "", tolerance = 0.000001) {
  const tokenize = (raw) => {
    const colors = [];
    const numbers = [];
    const value = raw
      .replace(/#[\da-f]{3,8}\b|rgba?\([^)]+\)/gi, (color) => {
        colors.push(parseColor(color));
        return "COLOR";
      })
      .replace(/(-?(?:\d*\.)?\d+)ms\b/g, (_, ms) => `${Number(ms) / 1000}s`)
      .replace(/-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi, (number) => {
        numbers.push(Number(number));
        return "NUMBER";
      })
      .replace(/\s+/g, "");
    return { value, colors, numbers };
  };
  const x = tokenize(a);
  const y = tokenize(b);
  return (
    x.value === y.value &&
    x.colors.length === y.colors.length &&
    x.colors.every((color, i) => same(color, y.colors[i])) &&
    x.numbers.length === y.numbers.length &&
    x.numbers.every((value, i) => Math.abs(value - y.numbers[i]) <= tolerance)
  );
}

export const shoulder = (radius, smoothing) => Number(((1 + smoothing) * radius).toFixed(2));
export const pause = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

export async function readShape(page, selector) {
  return page.$eval(selector, (el) => {
    const cs = getComputedStyle(el);
    const wrapper = el.parentElement;
    const ws = getComputedStyle(wrapper);
    const svgs = [...wrapper.querySelectorAll(":scope > svg")];
    const stroke = wrapper.querySelector(":scope > svg path[stroke][stroke-width]");
    return {
      token: el.dataset.clSquircle,
      state: el.dataset.state,
      clip: cs.clipPath,
      borderRadius: cs.borderRadius,
      inlineRadius: el.style.borderRadius,
      borderWidth: cs.borderTopWidth,
      borderColor: cs.borderTopColor,
      boxShadow: cs.boxShadow,
      bg: cs.backgroundColor,
      color: cs.color,
      blur: cs.backdropFilter,
      wrapperPosition: ws.position,
      wrapperOutline: ws.outlineColor,
      wrapperTransition: ws.transitionProperty,
      wrapperClass: wrapper.className,
      svgCount: svgs.length,
      strokes: svgs.flatMap((svg) => [...svg.querySelectorAll("path[stroke]")]).length,
      filters: svgs.flatMap((svg) => [...svg.querySelectorAll("filter")]).length,
      stroke: stroke
        ? {
            color: stroke.getAttribute("stroke"),
            opacity: Number(stroke.getAttribute("stroke-opacity") ?? 1),
          }
        : null,
    };
  });
}

export function strokeColor(shape) {
  const color = parseColor(shape.stroke?.color);
  return color && { ...color, a: color.a * shape.stroke.opacity };
}
