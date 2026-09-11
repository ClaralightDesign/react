import {
  parseColor,
  pathGeometry,
  pause,
  readShape,
  same,
  sameCss,
  shoulder,
  strokeColor,
} from "./assertions.mjs";

export async function checkInteractions({ page, url, ok, section, tokens }) {
  await page.goto(`${url}/audit.html`, { waitUntil: "networkidle0" });
  await page.waitForSelector('#probe-card[data-state="ready"]');
  const t = (name, scheme = "dark") => tokens[scheme][name];
  const n = (name) => Number.parseFloat(t(name));
  const transform = (selector) =>
    page.$eval(selector, (el) => {
      const cs = getComputedStyle(el.parentElement);
      const matrix = new DOMMatrixReadOnly(cs.transform);
      const properties = cs.transitionProperty.split(",").map((value) => value.trim());
      const durations = cs.transitionDuration
        .split(",")
        .map((value) => Number.parseFloat(value) * 1000);
      return {
        scale: matrix.a,
        scaleY: matrix.d,
        child: getComputedStyle(el).transform,
        duration: durations[properties.indexOf("transform") % durations.length],
        ease: cs.getPropertyValue("--cl-press-ease").trim(),
        active: el.matches(":active"),
      };
    });
  const hold = async (selector) => {
    const el = await page.$(selector);
    await el.scrollIntoView();
    const box = await el.boundingBox();
    if (!box) throw new Error(`Cannot press ${selector}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await pause(n("--cl-duration-press") + 80);
  };
  const near = (a, b) => Math.abs(a - b) < 0.0002;

  section("[Pointer · real down/up, token scale and release]");
  for (const size of ["sm", "md", "lg"]) {
    const selector = `#press-${size}`;
    const before = await transform(selector);
    await hold(selector);
    try {
      const pressed = await transform(selector);
      ok(
        `${size}: real mouse.down scales wrapper to size token`,
        pressed.active &&
          near(pressed.scale, n(`--cl-press-scale-${size}`)) &&
          near(pressed.scaleY, pressed.scale),
        JSON.stringify(pressed),
      );
      ok(
        `${size}: shape and SVG share wrapper transform`,
        before.child === "none" && pressed.child === "none",
        pressed.child,
      );
      ok(
        `${size}: press duration and curve consume tokens`,
        pressed.duration === n("--cl-duration-press") &&
          sameCss(pressed.ease, t("--ease-cl-press-in")),
        `${pressed.duration} / ${pressed.ease}`,
      );
    } finally {
      await page.mouse.up();
    }
    const released = await transform(selector);
    ok(
      `${size}: mouse.up selects spring release tokens`,
      released.duration === n("--cl-duration-release") &&
        sameCss(released.ease, t("--ease-cl-spring-press")) &&
        !released.active,
    );
    // Sample real rendered matrices throughout the release, rather than checking
    // only class names or a final identity matrix (which misses a dead animation).
    const samples = await page.$eval(
      selector,
      (el, duration) =>
        new Promise((resolve) => {
          const values = [];
          const start = performance.now();
          const sample = () => {
            values.push(new DOMMatrixReadOnly(getComputedStyle(el.parentElement).transform).a);
            if (performance.now() - start < duration) requestAnimationFrame(sample);
            else resolve(values);
          };
          requestAnimationFrame(sample);
        }),
      n("--cl-duration-release") + 100,
    );
    ok(
      `${size}: release visibly moves and returns to rest`,
      samples.some((value) => Math.abs(value - 1) > 0.0002) && near(samples.at(-1), 1),
      `${samples.length} samples; final ${samples.at(-1)}`,
    );
    ok(
      `${size}: spring release crosses rest before settling`,
      Math.min(...samples) < 1 - 0.0002,
      `min ${Math.min(...samples)}`,
    );
  }
  ok(
    "enabled controls actually fire click handlers",
    await page.$eval("#click-count", (el) => el.textContent === "3"),
  );

  section("[Disabled · pointer, keyboard and polymorphic links]");
  for (const selector of [
    "#disabled-button",
    "#disabled-primary",
    "#disabled-secondary",
    "#disabled-ghost",
    "#disabled-danger",
    "#disabled-link",
  ]) {
    await page.mouse.move(0, 0);
    await pause(n("--cl-duration-release") + 50);
    const before = await page.$eval(selector, (el) => getComputedStyle(el).backgroundColor);
    await hold(selector);
    try {
      const pressed = await transform(selector);
      ok(
        `${selector}: pointer hold does not scale`,
        near(pressed.scale, 1),
        JSON.stringify(pressed),
      );
      ok(
        `${selector}: disabled hover/press does not lift fill`,
        (await page.$eval(selector, (el) => getComputedStyle(el).backgroundColor)) === before,
      );
    } finally {
      await page.mouse.up();
    }
    await page.focus(selector);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    ok(
      `${selector}: pointer/keyboard cannot activate`,
      (await page.$eval("#click-count", (el) => el.textContent === "3")) &&
        !page.url().includes("unexpected-navigation"),
    );
  }
  await page.focus("#press-lg");
  await page.keyboard.press("Tab");
  await pause(60);
  const tabTarget = await page.evaluate(() => ({
    id: document.activeElement?.id,
    tag: document.activeElement?.tagName,
  }));
  ok(
    "Tab skips every disabled button and link",
    tabTarget.id === "variant-control",
    JSON.stringify(tabTarget),
  );

  section("[Reduced motion · actual interaction]");
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  try {
    ok(
      "reduced-motion emulation active",
      await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    );
    for (const size of ["sm", "md", "lg"]) {
      const selector = `#press-${size}`;
      await hold(selector);
      try {
        const pressed = await transform(selector);
        ok(
          `${size}: reduced-motion press has no scale`,
          pressed.active && near(pressed.scale, 1),
          JSON.stringify(pressed),
        );
        const durations = await page.$eval(selector, (el) =>
          getComputedStyle(el.parentElement)
            .transitionDuration.split(",")
            .map((value) => Number.parseFloat(value) * 1000),
        );
        ok(
          `${size}: reduced-motion fade consumes duration token`,
          durations.every((value) => value === n("--cl-duration-reduced")),
          durations.join(","),
        );
      } finally {
        await page.mouse.up();
      }
      await pause(n("--cl-duration-reduced") + 50);
      ok(
        `${size}: reduced-motion release remains at rest`,
        near((await transform(selector)).scale, 1),
      );
    }
    ok(
      "reduced motion preserves click behavior",
      await page.$eval("#click-count", (el) => el.textContent === "6"),
    );
  } finally {
    await page.emulateMediaFeatures([]);
    await page.mouse.move(0, 0);
  }

  section("[Squircle · refs, styles and live theme/variant effects]");
  await page.click("#report-refs");
  ok(
    "Squircle/Card/asChild refs point at shaped DOM nodes",
    await page.$eval("#ref-result", (el) => el.textContent === "true"),
  );
  for (const selector of ["#probe-shape", "#probe-card", "#probe-child"]) {
    const inline = await page.$eval(selector, (el) => ({
      width: el.style.width,
      padding: el.style.padding,
      clip: getComputedStyle(el).clipPath,
    }));
    ok(
      `${selector}: user style survives enhancement`,
      inline.width === "180px" && inline.padding === "8px" && inline.clip.startsWith("path("),
      JSON.stringify(inline),
    );
  }
  const cardNode = await page.$("#probe-card");
  const initial = await readShape(page, "#probe-card");
  ok(
    "initial SVG stroke consumes dark outline",
    same(strokeColor(initial), parseColor(t("--cl-outline"))),
    JSON.stringify(initial.stroke),
  );
  await page.$eval("#scope", (el) => {
    el.classList.replace("dark", "light");
  });
  await pause();
  const light = await readShape(page, "#probe-card");
  ok(
    "scoped light theme refreshes SVG stroke",
    same(strokeColor(light), parseColor(t("--cl-outline", "light"))) &&
      !same(strokeColor(initial), strokeColor(light)),
    JSON.stringify(light.stroke),
  );
  ok(
    "scoped light theme updates fill",
    same(parseColor(light.bg), parseColor(t("--cl-panel", "light"))),
  );
  await page.click("#variant-control");
  await pause();
  const control = await readShape(page, "#probe-card");
  ok(
    "variant control updates fill without remount",
    same(parseColor(control.bg), parseColor(t("--cl-control", "light"))) &&
      (await page.evaluate((node) => node === document.querySelector("#probe-card"), cardNode)),
  );
  ok(
    "variant control removes obsolete shadow SVG filters",
    initial.filters > 0 && control.filters === 0,
    `${initial.filters} -> ${control.filters}`,
  );
  await page.click("#variant-frost");
  await pause();
  const frost = await readShape(page, "#probe-card");
  ok(
    "variant frost refreshes SVG outline-strong",
    same(strokeColor(frost), parseColor(t("--cl-outline-strong", "light"))),
    JSON.stringify(frost.stroke),
  );
  ok(
    "variant frost restores SVG shadow and blur",
    frost.filters > 0 && frost.blur === `blur(${t("--blur-frost")})`,
  );
  await page.$eval("#scope", (el) => {
    el.classList.replace("light", "dark");
  });
  await pause();
  const darkFrost = await readShape(page, "#probe-card");
  ok(
    "switching back to dark refreshes existing frost SVG",
    same(strokeColor(darkFrost), parseColor(t("--cl-outline-strong"))),
  );
  ok(
    "theme and variant changes preserve DOM/ref identity",
    await page.evaluate((node) => node === document.querySelector("#probe-card"), cardNode),
  );
  await cardNode.dispose();

  section("[Squircle · scoped radius, smoothing, color and shadow overrides]");
  await page.click("#variant-panel");
  await pause();
  const before = await readShape(page, "#probe-shape");
  const shadowSignature = () =>
    page.$eval("#probe-shape", (el) =>
      [...el.parentElement.querySelectorAll("filter")].map((filter) => filter.innerHTML).join(""),
    );
  const initialShadow = await shadowSignature();
  const scopedSmoothing = n("--cl-corner-smoothing") / 2;
  // Alternate values derive from other repository tokens, not a second palette.
  await page.$eval(
    "#scope",
    (el, smoothing) => {
      el.style.setProperty("--radius-medium", "var(--radius-panel)");
      el.style.setProperty("--cl-corner-smoothing", String(smoothing));
      el.style.setProperty("--cl-outline", "var(--cl-accent)");
      el.style.setProperty("--shadow-panel", "var(--shadow-frost)");
    },
    scopedSmoothing,
  );
  await pause();
  const overridden = await readShape(page, "#probe-shape");
  ok(
    "scoped radius override rebuilds path",
    pathGeometry(overridden.clip).arcRadius === n("--radius-panel") &&
      overridden.clip !== before.clip,
  );
  ok(
    "scoped smoothing token controls path shoulders",
    pathGeometry(overridden.clip).startX === shoulder(n("--radius-panel"), scopedSmoothing),
    overridden.clip.slice(0, 70),
  );
  ok(
    "scoped outline override refreshes SVG border",
    same(strokeColor(overridden), parseColor(t("--cl-accent"))),
  );
  ok(
    "scoped shadow override refreshes SVG filters",
    overridden.filters > 0 && (await shadowSignature()) !== initialShadow,
  );
  ok(
    "scoped tokens do not leak to root",
    await page.evaluate(
      (radius) =>
        getComputedStyle(document.documentElement).getPropertyValue("--radius-medium").trim() ===
        radius,
      t("--radius-medium"),
    ),
  );
  await page.click("#smoothing-zero");
  await pause();
  const circular = await readShape(page, "#probe-shape");
  ok(
    "explicit smoothing=0 overrides inherited token",
    pathGeometry(circular.clip).startX === n("--radius-panel") && circular.clip !== overridden.clip,
    circular.clip.slice(0, 70),
  );
  // CSS lengths must be browser-resolved: parseFloat('1rem') is not one pixel.
  await page.$eval("#scope", (el) => {
    el.style.setProperty(
      "--radius-medium",
      "calc(var(--radius-control) + var(--radius-medium-source))",
    );
  });
  await page.$eval(
    "#scope",
    (el, value) => {
      el.style.setProperty("--radius-medium-source", value);
    },
    t("--radius-medium"),
  );
  await pause();
  ok(
    "scoped calc radius resolves as CSS length",
    pathGeometry((await readShape(page, "#probe-shape")).clip).arcRadius ===
      n("--radius-control") + n("--radius-medium"),
  );
  await page.$eval("#scope", (el) => {
    el.style.removeProperty("--radius-medium");
    el.style.removeProperty("--cl-corner-smoothing");
    el.style.removeProperty("--cl-outline");
    el.style.removeProperty("--shadow-panel");
  });
  await pause();
  const restored = await readShape(page, "#probe-card");
  ok(
    "removing overrides restores source geometry and SVG",
    pathGeometry(restored.clip).arcRadius === n("--radius-medium") &&
      same(strokeColor(restored), parseColor(t("--cl-outline"))),
  );
  await page.click("#unmount");
  await page.click("#report-refs");
  ok(
    "unmount clears object refs and runs composed callback cleanup",
    (await page.$eval("#ref-result", (el) => el.textContent === "true")) &&
      !(await page.$("#probe-card")),
  );
  ok(
    "unmount removes owned SVG overlays",
    await page.$$eval("#scope svg", (els) => els.length === 0),
  );
}
