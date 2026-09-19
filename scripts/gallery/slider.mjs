import { pause } from "./assertions.mjs";

export async function checkSlider({ page, url, ok, section }) {
  section("[Slider · bubble geometry and interaction]");
  await page.goto(`${url}/audit.html`, { waitUntil: "networkidle0" });
  const slider = await page.$("#slider-probe");
  await slider.focus();
  await page.keyboard.press("Home");
  await pause(350);
  const bubble = '[data-slot="slider-bubble"]';
  await page.waitForSelector(`${bubble} svg path`);
  const read = () => page.$eval(bubble, (element) => {
    const path = element.querySelector("svg path");
    const svg = element.querySelector("svg");
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const surface = svg.parentElement;
    return {
      width: svg.viewBox.baseVal.width,
      height: svg.viewBox.baseVal.height,
      fillRule: getComputedStyle(path).fillRule,
      fill: getComputedStyle(path).fill,
      portaled: !document.querySelector("#slider-probe").contains(element),
      pointerEvents: style.pointerEvents,
      opacity: getComputedStyle(surface).opacity,
      transform: style.transform,
      x: box.x,
      y: box.y,
    };
  });
  const first = await read();
  ok("bubble uses union-compatible fill", first.fillRule === "nonzero", JSON.stringify(first));
  ok("bubble escapes clipping parent", first.portaled && first.pointerEvents === "none", JSON.stringify(first));
  ok("bubble retains white handle material", first.fill === "rgb(255, 255, 255)", first.fill);
  await page.keyboard.press("End");
  await pause(450);
  const last = await read();
  ok("label digit changes retain measured dimensions", first.width === last.width && first.height === last.height, JSON.stringify({ first, last }));
  ok("bubble tracks keyboard movement", last.x > first.x + 200, JSON.stringify({ first, last }));
  const step = await page.$("#slider-step-probe");
  const box = await step.boundingBox();
  await page.mouse.click(box.x + 1.25 + (box.width - 2.5) * 0.34, box.y + box.height / 2);
  const value = await step.evaluate((element) => element.getAttribute("aria-valuenow"));
  ok("step overrides magnetic snap points", value === "30", value);
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.waitForFunction(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  await pause(150);
  await slider.focus();
  await page.keyboard.press("Home");
  await pause(150);
  const reduced = await read();
  const unrotated = await page.$eval(bubble, (element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    const inner = new DOMMatrixReadOnly(getComputedStyle(element.querySelector("svg").parentElement).transform);
    return Math.abs(matrix.b) < 0.0001 && Math.abs(matrix.c) < 0.0001 && inner.a === 1 && inner.d === 1;
  });
  ok("reduced motion has no swing or scale", unrotated, JSON.stringify(reduced));
  await page.emulateMediaFeatures([]);
  await slider.evaluate((element) => element.blur());
}
