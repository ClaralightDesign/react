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

/** The public gallery remains the end-to-end fixture: package exports + built CSS. */
export async function checkGallery({ page, url, ok, section, tokens, errors }) {
  const go = async (id) => {
    await page.goto(`${url}/#/${id}`, { waitUntil: "networkidle0" });
    await pause();
  };
  const clickText = async (text) => {
    const handle = await page.evaluateHandle(
      (label) =>
        [...document.querySelectorAll("button")].find((el) => el.textContent.trim() === label),
      text,
    );
    if (!handle.asElement()) throw new Error(`No button labelled ${text}`);
    await handle.asElement().click();
    await handle.dispose();
  };
  const t = (name) => tokens.dark[name];
  const n = (name) => Number.parseFloat(t(name));
  const color = (name) => parseColor(t(`--cl-${name}`));
  const geometry = (shape, radius) => {
    const got = pathGeometry(shape.clip);
    ok("arc consumes radius token", got.arcRadius === radius, `${got.arcRadius} / ${radius}`);
    ok(
      "shoulder consumes smoothing token",
      got.startX === shoulder(radius, n("--cl-corner-smoothing")),
      `${got.startX}`,
    );
  };
  const shape = (selector) => readShape(page, selector);
  const sampleExit = async (selector) => {
    const sampled = page.evaluate(
      (popupSelector) =>
        new Promise((resolve) => {
          const started = performance.now();
          const frames = [];
          const step = () => {
            const popup = document.querySelector(popupSelector);
            const wrapper = popup?.parentElement;
            if (
              !wrapper ||
              (frames.length > 0 &&
                !popup.hasAttribute("data-ending-style") &&
                !popup.checkVisibility())
            ) {
              resolve({ frames, duration: performance.now() - started, timedOut: false });
              return;
            }
            const style = getComputedStyle(wrapper);
            frames.push({
              scale: Number(style.scale.replace("none", "1")),
              opacity: Number(style.opacity),
              popupOpacity: Number(getComputedStyle(popup).opacity),
              ending: popup.hasAttribute("data-ending-style"),
              animationCount: popup.getAnimations().length,
              animationDurations: popup
                .getAnimations()
                .map((animation) => Number(animation.effect?.getTiming().duration))
                .filter(Number.isFinite),
            });
            if (Number(style.opacity) <= 0.01 || !popup.checkVisibility()) {
              resolve({ frames, duration: performance.now() - started, timedOut: false });
              return;
            }
            if (frames.length >= 40) {
              resolve({ frames, duration: performance.now() - started, timedOut: true });
              return;
            }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
      selector,
    );
    await page.keyboard.press("Escape");
    return sampled;
  };

  section("[Gallery · every page renders]");
  for (const id of [
    "button",
    "input",
    "card",
    "dialog",
    "select",
    "popover",
    "tooltip",
    "shape",
    "tokens",
  ]) {
    const before = errors.length;
    await go(id);
    const rendered = await page.$eval("main", (main) => ({
      text: main.textContent.trim().length,
      headings: main.querySelectorAll("h1,h2").length,
    }));
    ok(
      `#/${id} renders with content and no errors`,
      errors.length === before && rendered.text > 60 && rendered.headings > 0,
      JSON.stringify(rendered),
    );
  }

  section("[Tokens · source declarations reach the browser in both schemes]");
  await go("tokens");
  for (const scheme of ["dark", "light"]) {
    await page.evaluate((value) => {
      document.documentElement.className = value;
    }, scheme);
    // Computed custom properties preserve function syntax but resolve aliases.
    const expected = tokens[scheme];
    const actual = await page.evaluate((names) => {
      const cs = getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map((name) => [name, cs.getPropertyValue(name).trim()]));
    }, Object.keys(expected));
    const mismatches = Object.entries(expected).filter(
      ([name, value]) => !sameCss(actual[name], value),
    );
    ok(
      `${scheme}: every source token is present and matches`,
      mismatches.length === 0,
      `${Object.keys(expected).length} tokens; ${mismatches.map(([name, value]) => `${name}: ${actual[name]} != ${value}`).join("; ")}`,
    );
  }
  await page.evaluate(() => {
    document.documentElement.className = "dark";
  });

  section("[Tokens · ramp, shape, motion consumers]");
  const scale = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      body: getComputedStyle(document.body).fontSize,
      values: Object.fromEntries(
        [
          "--text-title",
          "--text-title--line-height",
          "--text-title--font-weight",
          "--text-display",
          "--radius-control",
          "--radius-capsule",
          "--radius-dialog",
          "--ease-cl-out",
          "--ease-cl-drawer",
          "--ease-cl-spring-overlay",
          "--ease-cl-spring-press",
          "--blur-frost",
        ].map((name) => [name, cs.getPropertyValue(name).trim()]),
      ),
    };
  });
  const sourceMatches = (...names) => names.every((name) => sameCss(scale.values[name], t(name)));
  ok(
    "title size, leading and weight match source",
    sourceMatches("--text-title", "--text-title--line-height", "--text-title--font-weight"),
  );
  ok("display step matches source", sourceMatches("--text-display"));
  ok(
    "control, capsule and dialog radii match source",
    sourceMatches("--radius-control", "--radius-capsule", "--radius-dialog"),
  );
  ok("entrance easing matches source", sourceMatches("--ease-cl-out"));
  ok("drawer easing matches source", sourceMatches("--ease-cl-drawer"));
  ok(
    "both sampled springs match source",
    sourceMatches("--ease-cl-spring-overlay", "--ease-cl-spring-press"),
  );
  ok("frost blur matches source", sourceMatches("--blur-frost"));
  ok("body consumes body type step", scale.body === t("--text-body"), scale.body);

  section("[Button · capsule, press, per-variant disabled]");
  await go("button");
  const btn = await page.evaluate(() => {
    const pick = (label, disabled) =>
      [...document.querySelectorAll("button")].find(
        (el) => el.textContent.trim() === label && el.disabled === disabled,
      );
    const read = (el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color };
    };
    const on = pick("Upload", false);
    const cs = getComputedStyle(on);
    return {
      sizes: ["Small", "Medium", "Large"].map((label) => [
        label,
        getComputedStyle(pick(label, false)).height,
      ]),
      height: cs.height,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      press: cs.getPropertyValue("--cl-press-scale").trim(),
      primaryOff: read(pick("Upload", true)),
      secondaryOff: read(pick("Cancel", true)),
      ghostOff: read(pick("Details", true)),
      dangerOff: read(pick("Delete", true)),
      dangerOn: read(pick("Delete", false)),
    };
  });
  const btnShape = await shape("button[data-cl-squircle]");
  ok(
    "button heights consume control size tokens",
    btn.sizes.every(
      ([, height], index) => height === t(`--spacing-control-${["sm", "md", "lg"][index]}`),
    ),
    JSON.stringify(btn.sizes),
  );
  ok(
    "large button label consumes typography tokens",
    btn.fontSize === t("--text-button") && btn.fontWeight === t("--text-button--font-weight"),
    `${btn.fontSize} / ${btn.fontWeight}`,
  );
  ok(
    "large button press scale consumes token",
    Number(btn.press) === n("--cl-press-scale-lg"),
    btn.press,
  );
  ok(
    "press transition lives on wrapper",
    btnShape.wrapperTransition.includes("transform"),
    btnShape.wrapperTransition,
  );
  ok("wrapper carries press behavior", btnShape.wrapperClass.includes("cl-press"));
  ok("wrapper carries focus ring", btnShape.wrapperClass.includes("cl-squircle-root"));
  geometry(btnShape, Math.min(n("--radius-capsule"), Number.parseFloat(btn.height) / 2));
  ok("border-radius cleared, preserving smooth clip", btnShape.borderRadius === "0px");
  ok("CSS border paint replaced by SVG", parseColor(btnShape.borderColor)?.a === 0);
  ok(
    "secondary disabled keeps floating fill",
    same(parseColor(btn.secondaryOff.bg), color("floating")),
  );
  ok("danger enabled consumes danger", same(parseColor(btn.dangerOn.bg), color("danger")));
  ok("disabled primary keeps accent", same(parseColor(btn.primaryOff.bg), color("accent")));
  ok(
    "disabled text consumes foreground-disabled",
    same(parseColor(btn.primaryOff.color), color("foreground-disabled")),
  );
  ok(
    "disabled danger drops color for control",
    same(parseColor(btn.dangerOff.bg), color("control")),
  );
  ok("disabled ghost has no fill", parseColor(btn.ghostOff.bg)?.a === 0);

  section("[Button · hover consumes repository color mix]");
  for (const [label, token] of [
    ["Delete", "danger"],
    ["Cancel", "floating"],
  ]) {
    const handle = await page.evaluateHandle(
      (text) =>
        [...document.querySelectorAll("button")].find(
          (el) => el.textContent.trim() === text && !el.disabled,
        ),
      label,
    );
    await handle.asElement().hover();
    await pause();
    const result = await page.evaluate(
      (el, fill, weight, tint) => {
        const expected = document.createElement("div");
        expected.style.backgroundColor = `color-mix(in oklab, ${fill} ${weight}, ${tint})`;
        document.body.append(expected);
        const after = getComputedStyle(el).backgroundColor;
        const want = getComputedStyle(expected).backgroundColor;
        expected.remove();
        return { after, want };
      },
      handle,
      t(`--cl-${token}`),
      t("--cl-hover-base-weight"),
      t("--cl-hover-tint"),
    );
    ok(
      `${label}: hover matches token-derived mix`,
      sameCss(result.after, result.want, 0.002),
      JSON.stringify(result),
    );
    if (label === "Cancel")
      ok("translucent hover changes the resting fill", result.after !== btn.secondaryOff.bg);
    await handle.dispose();
  }
  await page.mouse.move(0, 0);

  section("[Input · fill, SVG border, focus ring]");
  await go("input");
  const heights = await page.$$eval("input", (els) => els.map((el) => getComputedStyle(el).height));
  const field = await shape("input[data-cl-squircle]");
  ok(
    "input heights cover all control size tokens",
    ["sm", "md", "lg"].every((size) => heights.includes(t(`--spacing-control-${size}`))),
  );
  ok("input consumes translucent control fill", same(parseColor(field.bg), color("control")));
  ok(
    "SVG border consumes outline token",
    same(strokeColor(field), color("outline")),
    JSON.stringify(field.stroke),
  );
  geometry(field, n("--radius-control"));
  ok("input stale radius cleared", field.borderRadius === "0px");
  await page.focus("input[data-cl-squircle]");
  await pause();
  const focused = await shape("input[data-cl-squircle]");
  ok(
    "input takes real focus",
    await page.$eval("input[data-cl-squircle]", (el) => document.activeElement === el),
  );
  ok("input ring transparent before focus", parseColor(field.wrapperOutline)?.a === 0);
  ok(
    "input wrapper focus ring consumes accent",
    same(parseColor(focused.wrapperOutline), color("accent")),
  );
  const ring = await page.$eval("input[data-cl-squircle]", (el) => {
    const cs = getComputedStyle(el.parentElement);
    return [cs.outlineWidth, cs.outlineOffset];
  });
  ok(
    "focus ring width and offset consume tokens",
    ring[0] === t("--cl-focus-width") && ring[1] === t("--cl-focus-offset"),
    ring.join(" / "),
  );

  await page.type("input[data-cl-squircle]", "Browser regression");
  ok(
    "input accepts real keyboard text",
    await page.$eval("input[data-cl-squircle]", (el) => el.value === "Browser regression"),
  );
  await page.click("input:disabled");
  await page.keyboard.type("disabled");
  ok(
    "disabled input cannot focus or receive text",
    await page.$eval("input:disabled", (el) => document.activeElement !== el && el.value === ""),
  );

  section("[Card · surface stack and SVG effects]");
  await go("card");
  const cardCount = await page.$$eval('[data-cl-slot="card"]', (els) => els.length);
  const cards = [];
  for (let index = 0; index < cardCount; index++) {
    await page.$$eval(
      '[data-cl-slot="card"]',
      (els, i) => {
        els[i].id = `gallery-card-${i}`;
      },
      index,
    );
    cards.push(await shape(`#gallery-card-${index}`));
  }
  const card = cards[0];
  ok("three cards are shaped", cardCount === 3);
  ok(
    "all cards ready",
    cards.every((item) => item.state === "ready"),
  );
  ok(
    "cards use medium radius",
    cards.every((item) => item.token === "medium"),
  );
  ok("card uses SVG path rather than corner-shape", card.clip.startsWith('path("M '));
  geometry(card, n("--radius-medium"));
  ok("card fallback radius removed", card.borderRadius === "0px" && card.inlineRadius === "");
  ok("card fill consumes panel", same(parseColor(card.bg), color("panel")));
  ok("card CSS border paint replaced by SVG", parseColor(card.borderColor)?.a === 0);
  ok("card CSS shadow extracted", card.boxShadow === "none");
  ok("overlay anchor positioned", card.wrapperPosition === "relative");
  ok("effects and drop shadow overlays mounted", card.svgCount === 2);
  ok("border becomes SVG strokes", card.strokes > 0);
  ok("shadow becomes SVG filters", card.filters > 0);
  ok(
    "frost card consumes blur token",
    cards.some((item) => item.blur === `blur(${t("--blur-frost")})`),
  );

  section("[Dialog · surface, geometry, focus]");
  await go("dialog");
  await clickText("Open dialog");
  await pause(600);
  const dlg = await shape('[data-cl-slot="dialog-popup"]');
  const position = await page.$eval('[data-cl-slot="dialog-popup"]', (el) => {
    const wrapper = el.parentElement;
    const rect = wrapper.getBoundingClientRect();
    return {
      role: el.getAttribute("role"),
      translate: getComputedStyle(wrapper).translate,
      centered:
        Math.abs(rect.x + rect.width / 2 - innerWidth / 2) < 1.5 &&
        Math.abs(rect.y + rect.height / 2 - innerHeight / 2) < 1.5,
    };
  });
  ok("dialog opens with role", position.role === "dialog");
  ok("dialog consumes frost blur", dlg.blur === `blur(${t("--blur-frost")})`);
  ok("dialog fill consumes frost", same(parseColor(dlg.bg), color("frost")));
  const scrim = await page.$eval(
    '[data-cl-slot="dialog-backdrop"]',
    (el) => getComputedStyle(el).backgroundColor,
  );
  ok("dialog backdrop consumes scrim", same(parseColor(scrim), color("scrim")));
  geometry(dlg, n("--radius-dialog"));
  ok("dialog wrapper fixed positioned", dlg.wrapperPosition === "fixed");
  ok("dialog wrapper centered", position.translate === "-50% -50%" && position.centered);
  ok("dialog wrapper owns entrance", dlg.wrapperTransition.includes("scale"));
  ok("dialog wrapper mirrors transition state", dlg.wrapperClass.includes("cl-enter-root"));
  const trapped = [];
  for (let i = 0; i < 8; i++) {
    trapped.push(
      await page.$eval('[data-cl-slot="dialog-popup"]', (el) =>
        el.contains(document.activeElement),
      ),
    );
    await page.keyboard.press("Tab");
    await pause(60);
  }
  ok("focus trapped through eight real tabs", trapped.every(Boolean), trapped.join(","));
  const dialogExit = await sampleExit('[data-cl-slot="dialog-popup"]');
  ok(
    "dialog stays mounted through its wrapper exit",
    !dialogExit.timedOut &&
      dialogExit.frames.length >= 2 &&
      dialogExit.frames.some(
        (frame) =>
          frame.ending &&
          frame.animationCount > 0 &&
          frame.animationDurations.includes(n("--cl-duration-surface")),
      ) &&
      `${dialogExit.duration.toFixed(1)}ms / ${dialogExit.frames.length} frames`,
  );
  await pause(300);
  ok("Escape unmounts dialog", !(await page.$('[data-cl-slot="dialog-popup"]')));
  ok(
    "dialog restores trigger focus",
    await page.evaluate(() => document.activeElement?.textContent.trim() === "Open dialog"),
  );
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await clickText("Open dialog");
  await pause(300);
  const reducedDialogExit = await sampleExit('[data-cl-slot="dialog-popup"]');
  ok(
    "reduced dialog exit fades without scale",
    !reducedDialogExit.timedOut &&
      reducedDialogExit.frames.length >= 2 &&
      reducedDialogExit.frames.every((frame) => frame.scale === 1) &&
      Math.min(...reducedDialogExit.frames.map((frame) => frame.opacity)) < 0.25 &&
      reducedDialogExit.frames.some((frame) =>
        frame.animationDurations.includes(n("--cl-duration-reduced")),
      ) &&
      `${reducedDialogExit.duration.toFixed(1)}ms / ${reducedDialogExit.frames.map((frame) => frame.opacity).join(" ")}`,
  );
  await pause(300);
  await page.emulateMediaFeatures([]);

  section("[Select · popup and keyboard]");
  await go("select");
  const trigger = '[data-cl-slot="select-trigger"]';
  ok(
    "trigger resolves items label",
    (await page.$eval(trigger, (el) => el.textContent.trim())).startsWith("Sans-serif"),
  );
  ok(
    "select trigger consumes control radius",
    pathGeometry((await shape(trigger)).clip).arcRadius === n("--radius-control"),
  );
  await page.focus(trigger);
  await pause();
  ok(
    "select wrapper focus ring consumes accent",
    (await page.$eval(trigger, (el) => document.activeElement === el)) &&
      same(parseColor((await shape(trigger)).wrapperOutline), color("accent")),
  );
  await page.click(trigger);
  await pause(400);
  const select = await shape('[data-cl-slot="select-content"]');
  const placement = await page.$eval('[data-cl-slot="select-content"]', (el) => {
    const wrapper = el.parentElement;
    const cs = getComputedStyle(wrapper.parentElement);
    return {
      itemRadius: getComputedStyle(document.querySelector('[data-cl-slot="select-item"]'))
        .borderRadius,
      origin: cs.getPropertyValue("--transform-origin").trim(),
      wrapperOrigin: getComputedStyle(wrapper).transformOrigin,
      anchor: cs.getPropertyValue("--anchor-width").trim(),
      height: cs.getPropertyValue("--available-height").trim(),
    };
  });
  ok("select popup frosted", select.blur === `blur(${t("--blur-frost")})`);
  ok(
    "select popup consumes medium radius",
    pathGeometry(select.clip).arcRadius === n("--radius-medium"),
  );
  ok("select item consumes inset radius", placement.itemRadius === t("--radius-item"));
  ok("Base UI computes transform origin", placement.origin.length > 0);
  const values = (raw) => raw.split(/\s+/).map(Number.parseFloat);
  ok(
    "popup grows from trigger origin",
    values(placement.wrapperOrigin).every(
      (value, i) => Math.abs(value - values(placement.origin)[i]) < 0.5,
    ),
  );
  ok("select wrapper owns entrance", select.wrapperClass.includes("cl-enter-root"));
  ok("Base UI measures anchor and available height", !!placement.anchor && !!placement.height);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await pause(400);
  ok(
    "ArrowDown + Enter selects next item",
    (await page.$eval(trigger, (el) => el.textContent.trim())).startsWith("Serif"),
  );

  await page.click(trigger);
  await pause();
  await page.keyboard.type("mono");
  await page.keyboard.press("Enter");
  await pause();
  ok(
    "select typeahead resolves Monospace",
    (await page.$eval(trigger, (el) => el.textContent.trim())).startsWith("Monospace"),
  );
  await page.click(trigger);
  await pause();
  const selectExit = await sampleExit('[data-cl-slot="select-content"]');
  const selectScales = selectExit.frames.map((frame) => frame.scale);
  ok(
    "select stays mounted through its wrapper exit",
    !selectExit.timedOut &&
      selectExit.frames.length >= 2 &&
      selectExit.frames.some((frame) => frame.ending && frame.animationCount > 0) &&
      Math.min(...selectScales) < 0.99 &&
      selectExit.frames.some(
        (frame) => frame.ending && frame.animationDurations.includes(n("--cl-duration-surface")),
      ) &&
      `${selectExit.duration.toFixed(1)}ms / ${Math.min(...selectScales)}`,
  );
  await pause(300);
  ok(
    "select Escape closes and restores focus",
    (await page.$$eval('[data-cl-slot="select-content"]', (els) =>
      els.every((el) => !el.checkVisibility()),
    )) &&
      (await page.$eval(
        trigger,
        (el) => document.activeElement === el && el.getAttribute("aria-expanded") === "false",
      )),
  );
  await page.click('[data-cl-slot="select-trigger"][data-disabled]');
  await page.keyboard.press("ArrowDown");
  await pause();
  ok(
    "disabled select cannot open from pointer or keyboard",
    await page.$$eval('[data-cl-slot="select-content"]', (els) =>
      els.every((el) => !el.checkVisibility()),
    ),
  );
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.click(trigger);
  await pause(300);
  const reducedSelectExit = await sampleExit('[data-cl-slot="select-content"]');
  ok(
    "reduced select exit fades without scale",
    !reducedSelectExit.timedOut &&
      reducedSelectExit.frames.length >= 2 &&
      reducedSelectExit.frames.every((frame) => frame.scale === 1) &&
      Math.min(...reducedSelectExit.frames.map((frame) => frame.opacity)) < 0.25 &&
      reducedSelectExit.frames.some((frame) =>
        frame.animationDurations.includes(n("--cl-duration-reduced")),
      ) &&
      `${reducedSelectExit.duration.toFixed(1)}ms / ${reducedSelectExit.frames.map((frame) => frame.opacity).join(" ")}`,
  );
  await pause(300);
  await page.emulateMediaFeatures([]);

  section("[Popover · one surface, body and tail]");
  await go("popover");
  const openPopover = async (label) => {
    await clickText(label);
    await pause(500);
    return page.$eval('[data-cl-slot="popover-content"]', (el) => {
      const cs = getComputedStyle(el);
      const wrapper = el.parentElement;
      const probe = el.querySelector("[data-cl-anchor-probe]");
      const box = el.getBoundingClientRect();
      const arrow = probe?.getBoundingClientRect();
      return {
        side: el.dataset.side,
        role: el.getAttribute("role"),
        clip: cs.clipPath,
        subpaths: (cs.clipPath.match(/M/g) ?? []).length,
        padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft],
        origin: getComputedStyle(wrapper).transformOrigin,
        strokes: wrapper.querySelectorAll("svg path[stroke]").length,
        size: [box.width, box.height],
        arrowCenter: arrow ? arrow.x + arrow.width / 2 - box.x : null,
      };
    });
  };
  const closePopover = async () => {
    await page.keyboard.press("Escape");
    await pause(400);
  };
  /**
   * Click a trigger and sample the wrapper from the first frame it exists.
   *
   * The entrance is a transition, and what it *starts* at is the whole question:
   * a dialog begins at 95% of its size, an anchored overlay at nothing at all.
   * Sampling starts before the click so the first frame is not missed.
   */
  const sampleEntrance = async (label) => {
    const sampled = page.evaluate(
      () =>
        new Promise((resolve) => {
          const frames = [];
          const step = () => {
            const wrapper = document.querySelector(
              '[data-cl-slot="popover-content"]',
            )?.parentElement;
            if (wrapper) {
              const style = getComputedStyle(wrapper);
              frames.push({
                scale: Number(style.scale.replace("none", "1")),
                opacity: Number(style.opacity),
              });
            }
            // Past the 250ms entrance at 60Hz, and counted from the surface's
            // first frame so a slow start cannot consume the window.
            if (frames.length < 24) requestAnimationFrame(step);
            else resolve(frames);
          };
          requestAnimationFrame(step);
        }),
    );
    await pause(50);
    await clickText(label);
    const frames = await sampled;
    const rest = await page.$eval('[data-cl-slot="popover-content"]', (el) => {
      const wrapper = el.parentElement;
      const style = getComputedStyle(wrapper);
      const properties = style.transitionProperty.split(",").map((value) => value.trim());
      const durations = style.transitionDuration
        .split(",")
        .map((value) => Number.parseFloat(value) * 1000);
      return {
        wrapperClass: wrapper.className,
        property: properties.join(" "),
        duration: durations[properties.indexOf("scale") % durations.length],
      };
    });
    return { frames, ...rest };
  };

  const top = await openPopover("top");
  const popover = await shape('[data-cl-slot="popover-content"]');
  ok("popover opens with a dialog role", top.role === "dialog", top.role);
  ok("popover consumes frost blur", popover.blur === `blur(${t("--blur-frost")})`, popover.blur);
  ok("popover fill consumes frost", same(parseColor(popover.bg), color("frost")));
  ok(
    "popover outline consumes the strong outline token",
    same(strokeColor(popover), color("outline-strong")),
    JSON.stringify(popover.stroke),
  );
  ok(
    "anchored surfaces carry no shadow",
    popover.boxShadow.split("rgba(0, 0, 0, 0)").length - 1 > 0 &&
      !/[1-9]/.test(popover.boxShadow.replace(/rgba?\([^)]*\)/g, "")),
    popover.boxShadow,
  );
  geometry(popover, n("--radius-panel"));
  ok("popover stale radius cleared", popover.borderRadius === "0px");
  ok("popover CSS border paint replaced by SVG", parseColor(popover.borderColor)?.a === 0);
  ok(
    "the tail is spliced into the body, not a second element",
    top.subpaths === 1 && top.strokes === 1,
    `${top.subpaths} subpaths, ${top.strokes} strokes`,
  );
  ok(
    "content clears the tail on the anchored edge",
    Number.parseFloat(top.padding[2]) - Number.parseFloat(top.padding[0]) ===
      n("--cl-arrow-extent"),
    top.padding.join(" / "),
  );
  const origin = top.origin.split(/\s+/).map(Number.parseFloat);
  ok(
    "the entrance grows from the tail's tip, not the anchor's edge",
    Math.abs(origin[1] - top.size[1]) < 0.5,
    `${top.origin} of ${top.size[1]}px`,
  );
  ok(
    "the tail follows the anchor Base UI resolved",
    Math.abs(origin[0] - top.arrowCenter) < 0.5,
    `${origin[0]} vs ${top.arrowCenter}`,
  );
  await closePopover();

  const entrance = await sampleEntrance("top");
  const scales = entrance.frames.map((frame) => frame.scale);
  ok(
    "the anchored entrance grows the surface from zero",
    Math.min(...scales) < 0.25 && Math.max(...scales) > 0.99,
    `${Math.min(...scales)} -> ${Math.max(...scales).toFixed(3)}`,
  );
  ok(
    "the entrance is the overlay's own, not the dialog nudge",
    entrance.wrapperClass.includes("cl-anchored-root") &&
      !entrance.wrapperClass.includes("cl-enter-root"),
    entrance.wrapperClass,
  );
  ok(
    "nothing fades on the way in: the surface arrives opaque and grows",
    entrance.frames.every((frame) => frame.opacity === 1),
    entrance.frames.map((frame) => frame.opacity).join(" "),
  );
  ok(
    "the entrance consumes the overlay spring's duration",
    entrance.property === "scale" && entrance.duration === n("--cl-duration-enter"),
    `${entrance.property} ${entrance.duration}ms`,
  );
  ok(
    "the entrance is the overlay spring, not a curve: it overshoots",
    Math.max(...scales) > 1,
    `${Math.max(...scales).toFixed(3)}`,
  );
  await closePopover();

  await openPopover("top");
  const exit = await sampleExit('[data-cl-slot="popover-content"]');
  const exitScales = exit.frames.map((frame) => frame.scale);
  ok(
    "the anchored exit stays mounted while the surface shrinks",
    !exit.timedOut &&
      exit.frames.length >= 2 &&
      exit.frames.some(
        (frame) =>
          frame.ending &&
          frame.animationCount > 0 &&
          frame.animationDurations.includes(n("--cl-duration-exit")),
      ) &&
      exitScales[0] > 0.75 &&
      exitScales.at(-1) < 0.25,
    `${exit.duration.toFixed(1)}ms / ${exitScales[0]} -> ${exitScales.at(-1)}`,
  );
  ok(
    "normal anchored exit leaves opacity untouched",
    exit.frames.every((frame) => frame.opacity === 1 && frame.popupOpacity === 1),
    exit.frames.map((frame) => `${frame.opacity}/${frame.popupOpacity}`).join(" "),
  );

  // Reduced motion drops the one part that moves and keeps the overlay legible
  // with a fade — the same split the Flutter overlay makes.
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const reduced = await sampleEntrance("top");
  ok(
    "reduced motion trades the growth for a fade",
    reduced.frames.every((frame) => frame.scale === 1) &&
      Math.min(...reduced.frames.map((frame) => frame.opacity)) < 0.25 &&
      reduced.frames.at(-1).opacity === 1,
    reduced.frames.map((frame) => frame.scale).join(" "),
  );
  ok(
    "the reduced entrance consumes the reduced duration",
    reduced.property === "opacity" && reduced.duration === n("--cl-duration-reduced"),
    `${reduced.property} ${reduced.duration}ms`,
  );
  const reducedExit = await sampleExit('[data-cl-slot="popover-content"]');
  ok(
    "reduced motion exits with a fade and no scale",
    !reducedExit.timedOut &&
      reducedExit.frames.length >= 2 &&
      reducedExit.frames.every((frame) => frame.scale === 1) &&
      Math.min(...reducedExit.frames.map((frame) => frame.opacity)) < 0.25 &&
      reducedExit.frames.some((frame) =>
        frame.animationDurations.includes(n("--cl-duration-reduced")),
      ) &&
      `${reducedExit.duration.toFixed(1)}ms / ${reducedExit.frames.map((frame) => frame.opacity).join(" ")}`,
  );
  await page.emulateMediaFeatures([]);

  const plain = await openPopover("No arrow");
  ok(
    "no arrow leaves an even inset and a single closed path",
    plain.subpaths === 1 && plain.padding[0] === plain.padding[2],
    plain.padding.join(" / "),
  );
  await closePopover();

  // A short edge cannot hold a 24px base: the two corners meet in the middle of
  // it. The surface becomes a union there rather than losing its tail.
  const left = await openPopover("left");
  ok("side is the physical side Base UI resolved", left.side === "left", left.side);
  ok(
    "a short anchored edge keeps its tail as a union",
    left.subpaths === 2 && left.strokes === 2,
    `${left.subpaths} subpaths, ${left.strokes} strokes`,
  );
  ok(
    "the union still points at the anchor",
    Math.abs(Number.parseFloat(left.origin.split(/\s+/)[0]) - left.size[0]) < 0.5,
    `${left.origin} of ${left.size[0]}px`,
  );
  await closePopover();

  const full = page.viewport();
  /*
   * Nothing above the trigger means nothing fits above it — but the gallery
   * scrolls inside `main`, not the window, so pinning the trigger to the top of
   * the viewport means shrinking the viewport until that container can scroll
   * that far. 380px first, so the content overflows and `scrollHeight` reports
   * the content rather than the container it happens to be sitting in.
   */
  await page.setViewport({ ...full, height: 380 });
  const pinned = await page.evaluate(() => {
    const el = [...document.querySelectorAll("button")].find(
      (node) => node.textContent.trim() === "top",
    );
    const main = el.closest("main");
    const offset =
      el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
    return { height: main.scrollHeight - offset + 24 };
  });
  await page.setViewport({ ...full, height: Math.max(200, Math.round(pinned.height)) });
  await pause(300);
  const headroom = await page.evaluate(() => {
    const el = [...document.querySelectorAll("button")].find(
      (node) => node.textContent.trim() === "top",
    );
    el.scrollIntoView({ block: "start" });
    return el.getBoundingClientRect().top;
  });
  await pause(300);
  const flipped = await openPopover("top");
  ok(
    "a surface with no room above flips below its trigger",
    flipped.side === "bottom" && headroom < 40,
    `${flipped.side}, ${Math.round(headroom)}px of headroom`,
  );
  ok(
    "the tail moves to the edge that now faces the anchor",
    Number.parseFloat(flipped.padding[0]) - Number.parseFloat(flipped.padding[2]) ===
      n("--cl-arrow-extent"),
    flipped.padding.join(" / "),
  );
  await closePopover();
  await page.setViewport(full);
  await pause(300);

  section("[Tooltip · dwell, grace period and focus]");
  await go("tooltip");
  const hover = async (label) => {
    const box = await page.evaluate((text) => {
      const el = [...document.querySelectorAll("button")].find(
        (node) => node.textContent.trim() === text,
      );
      const rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, label);
    await page.mouse.move(box.x, box.y);
  };
  const tooltipOpen = () =>
    page.$$eval('[data-cl-slot="tooltip-content"]', (els) =>
      els.some((el) => el.checkVisibility()),
    );

  // Park the pointer clear of every trigger first: navigating does not move it,
  // and a tooltip already dwelling would make the next assertion meaningless.
  await page.mouse.move(2, 2);
  await pause(300);
  await hover("Align left");
  await pause(150);
  const early = await tooltipOpen();
  await pause(900);
  ok("a tooltip waits out its dwell before appearing", !early && (await tooltipOpen()));
  const label = await shape('[data-cl-slot="tooltip-content"]');
  ok("tooltip consumes frost blur", label.blur === `blur(${t("--blur-frost")})`);
  ok(
    "tooltip outline consumes the plain outline token",
    same(strokeColor(label), color("outline")),
    JSON.stringify(label.stroke),
  );
  geometry(label, n("--radius-medium"));
  ok(
    "tooltip text consumes the callout step",
    (await page.$eval(
      '[data-cl-slot="tooltip-content"]',
      (el) => getComputedStyle(el).fontSize,
    )) === t("--text-callout"),
  );
  const tooltipLayout = await page.$eval('[data-cl-slot="tooltip-content"]', (el) => {
    const popup = el.getBoundingClientRect();
    const wrapper = el.parentElement.getBoundingClientRect();
    const current = el.querySelector("[data-current]");
    const currentRect = current?.getBoundingClientRect();
    const lineHeight = current ? Number.parseFloat(getComputedStyle(current).lineHeight) : 0;
    return {
      frameAligned:
        Math.abs(wrapper.left - popup.left) < 1 &&
        Math.abs(wrapper.top - popup.top) < 1 &&
        Math.abs(wrapper.width - popup.width) < 1 &&
        Math.abs(wrapper.height - popup.height) < 1,
      singleLine: Boolean(currentRect && currentRect.height <= lineHeight + 1),
    };
  });
  ok("morphing tooltip keeps its frame aligned", tooltipLayout.frameAligned);
  ok("short tooltip labels do not wrap", tooltipLayout.singleLine);
  ok(
    "a tooltip never takes the pointer",
    (await page.$eval(
      '[data-cl-slot="tooltip-content"]',
      (el) => getComputedStyle(el.parentElement.parentElement).pointerEvents,
    )) === "none",
  );

  await hover("Align right");
  await pause(20);
  const textBlur = await page.$eval('[data-cl-slot="tooltip-viewport"]', (el) => {
    const current = el.querySelector("[data-current]");
    const styles = current ? getComputedStyle(current) : null;
    const toMilliseconds = (value) =>
      value.trim().endsWith("ms") ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
    const delays = styles?.transitionDelay.split(",") ?? [];
    const durations = styles?.transitionDuration.split(",") ?? [];
    const previous = el.querySelector("[data-previous]");
    const previousStyles = previous ? getComputedStyle(previous) : null;
    const previousDelays = previousStyles?.transitionDelay.split(",") ?? [];
    const previousDurations = previousStyles?.transitionDuration.split(",") ?? [];
    return {
      hasPrevious: Boolean(previous),
      filterDelay: toMilliseconds(delays[3] ?? "0ms"),
      opacityDelay: toMilliseconds(delays[2] ?? "0ms"),
      opacityDuration: toMilliseconds(durations[2] ?? "0ms"),
      previousOpacityDelay: toMilliseconds(previousDelays[2] ?? "0ms"),
      previousOpacityDuration: toMilliseconds(previousDurations[2] ?? "0ms"),
    };
  });
  ok(
    "tooltip labels cross-fade without an empty handoff",
    textBlur.hasPrevious &&
      Math.round(textBlur.filterDelay) === n("--cl-duration-tooltip-content-exit") &&
      Math.round(textBlur.opacityDelay) === 0 &&
      Math.round(textBlur.opacityDuration) === n("--cl-duration-tooltip-content-exit") &&
      Math.round(textBlur.previousOpacityDelay) === n("--cl-duration-tooltip-content-exit") &&
      Math.round(textBlur.previousOpacityDuration) === n("--cl-duration-tooltip-content-exit"),
  );
  await pause(180);
  ok("an adjacent tooltip opens inside the shared grace period", await tooltipOpen());
  ok(
    "the shared tooltip morphs to the active trigger",
    (await page.$eval(
      '[data-cl-slot="tooltip-content"]',
      (el) => el.textContent?.trim() === "Align right",
    )) === true,
  );

  /*
   * The tail leads the surface to a new trigger, sampled frame by frame across
   * one switch: it goes as far towards the trigger as its edge allows and rides
   * there while the body travels, so it is already home when the body arrives.
   * The same frames are the only place the clamp that keeps the base off the
   * corners can be checked under motion — the tail spends the lead parked
   * against exactly that limit.
   */
  await page.mouse.move(2, 2);
  await pause(Number.parseFloat(t("--cl-tooltip-grace")) + 300);
  await hover("Align left");
  await pause(900);
  const morph = page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const popup = document.querySelector('[data-cl-slot="tooltip-content"]');
        const root = popup.closest(".cl-anchored-root");
        const track = document.querySelector("[data-cl-anchor-track]");
        const extent = Number.parseFloat(
          getComputedStyle(popup).getPropertyValue("--cl-arrow-extent"),
        );
        const start = Number.parseFloat(getComputedStyle(track).left);
        const samples = [];
        const tick = () => {
          const rect = popup.getBoundingClientRect();
          const edge = rect.height - extent;
          // Every absolute point the path puts on the tail's own edge, in the
          // order it walks them. Lisse winds clockwise, so that edge runs back.
          const walk = [...getComputedStyle(popup).clipPath.matchAll(/[MLC]([^A-Za-z"]*)/g)]
            .flatMap((match) => {
              const numbers = (match[1].match(/-?\d*\.?\d+/g) ?? []).map(Number);
              const pairs = [];
              for (let index = 0; index + 1 < numbers.length; index += 2) {
                pairs.push([numbers[index], numbers[index + 1]]);
              }
              return pairs;
            })
            .filter(([, y]) => Math.abs(y - edge) < 0.05)
            .map(([x]) => x);
          samples.push({
            target: Number.parseFloat(track.style.left),
            rendered: Number.parseFloat(getComputedStyle(track).left),
            tail: Number.parseFloat(getComputedStyle(root).transformOrigin),
            onEdge: walk.length,
            doublesBack: walk.some((x, index) => index > 0 && x > walk[index - 1] + 0.001),
          });
          if (samples.length < count) requestAnimationFrame(tick);
          else resolve({ start, samples });
        };
        requestAnimationFrame(tick);
      }),
    50,
  );
  await hover("Align right");
  const { start: from, samples } = await morph;
  const last = samples.at(-1);
  const journey = last.target - from;
  const resting = last.tail;
  // Towards the new trigger, whichever way along the edge that is.
  const lead = (sample) => (sample.tail - resting) * Math.sign(journey);
  const ahead = samples.filter(
    (sample) => Math.abs(sample.rendered - from) < Math.abs(journey) / 4 && lead(sample) > 0.5,
  );
  ok(
    "the tail leads the surface towards its new trigger",
    Math.abs(journey) > 20 && ahead.length > 0 && Math.max(...samples.map(lead)) > 2,
    `${ahead.length} of ${samples.length} frames lead by up to ${Math.max(...samples.map(lead)).toFixed(1)}px, over a ${journey.toFixed(0)}px journey`,
  );
  const landed = await page.evaluate(() => {
    const popup = document.querySelector('[data-cl-slot="tooltip-content"]');
    const root = popup.closest(".cl-anchored-root");
    const trigger = [...document.querySelectorAll("button")].find(
      (node) => node.textContent.trim() === "Align right",
    );
    const box = trigger.getBoundingClientRect();
    return {
      tail:
        popup.getBoundingClientRect().left +
        Number.parseFloat(getComputedStyle(root).transformOrigin),
      anchor: box.left + box.width / 2,
    };
  });
  ok(
    "and comes to rest pointing at it, with the track stopped",
    Math.abs(landed.tail - landed.anchor) < 2 &&
      Math.abs(last.rendered - last.target) < 0.5 &&
      samples.slice(-5).every((sample) => Math.abs(sample.tail - resting) < 0.5),
    `tail ${landed.tail.toFixed(1)} vs anchor ${landed.anchor.toFixed(1)}`,
  );
  ok(
    "no frame of the morph doubles the path back over a corner",
    samples.every((sample) => sample.onEdge > 4 && !sample.doublesBack),
    `${samples.filter((sample) => sample.doublesBack).length} of ${samples.length} frames double back`,
  );
  await page.mouse.move(2, 2);
  await pause(Number.parseFloat(t("--cl-tooltip-grace")) + 300);
  await hover("Align centre");
  await pause(200);
  ok("the dwell comes back once the grace period lapses", !(await tooltipOpen()));
  await pause(800);
  ok("and the tooltip still opens after it", await tooltipOpen());
  const tooltipExit = await sampleExit('[data-cl-slot="tooltip-content"]');
  ok(
    "tooltip stays mounted through its wrapper exit",
    !tooltipExit.timedOut &&
      tooltipExit.frames.length >= 2 &&
      tooltipExit.frames.some(
        (frame) =>
          frame.ending &&
          frame.animationCount > 0 &&
          frame.animationDurations.includes(n("--cl-duration-exit")),
      ) &&
      tooltipExit.frames.at(-1).scale < 0.25,
    `${tooltipExit.duration.toFixed(1)}ms / ${tooltipExit.frames.length} frames`,
  );
  ok("Escape dismisses a tooltip", !(await tooltipOpen()));
  await page.mouse.move(2, 2);
  await pause(300);

  section("[Corner shape gallery]");
  await go("shape");
  const states = await page.$$eval("[data-state]", (els) => els.map((el) => el.dataset.state));
  ok(
    "smoothing ladder all ready",
    states.length >= 8 && states.every((state) => state === "ready"),
    `${states.length} samples`,
  );
}
