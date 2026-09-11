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

  section("[Gallery · every page renders]");
  for (const id of ["button", "input", "card", "dialog", "select", "shape", "tokens"]) {
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
  await page.keyboard.press("Escape");
  await pause(600);
  ok("Escape unmounts dialog", !(await page.$('[data-cl-slot="dialog-popup"]')));
  ok(
    "dialog restores trigger focus",
    await page.evaluate(() => document.activeElement?.textContent.trim() === "Open dialog"),
  );

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
  await page.keyboard.press("Escape");
  await pause();
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

  section("[Corner shape gallery]");
  await go("shape");
  const states = await page.$$eval("[data-state]", (els) => els.map((el) => el.dataset.state));
  ok(
    "smoothing ladder all ready",
    states.length >= 8 && states.every((state) => state === "ready"),
    `${states.length} samples`,
  );
}
