import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const source = readFileSync(
  new URL("../assets/bnfsj-sections.js", import.meta.url),
  "utf8",
);

function page(markup, setup = () => {}) {
  const dom = new JSDOM(`<html dir="rtl"><body>${markup}</body></html>`, {
    runScripts: "outside-only",
    url: "https://store.test/l/example",
  });
  dom.window.matchMedia = () => ({ matches: true });
  setup(dom.window);
  dom.window.eval(source);
  dom.window.BnfsjSections.initialize();
  return dom;
}

function countdown(id, date) {
  return `<section id="${id}" data-bnfsj-countdown data-date="${date}">
    <div data-countdown-content><span data-countdown-part="days"></span><span data-countdown-part="hours"></span><span data-countdown-part="minutes"></span><span data-countdown-part="seconds"></span></div>
    <p data-countdown-ended hidden>Offer finished</p>
  </section>`;
}

test("repeated countdown sections have independent state and completed copy remains visible", () => {
  const now = Date.parse("2030-01-01T12:00:00Z");
  const dom = page(
    countdown("active", "2030-01-02T14:03:04Z") +
      countdown("ended", "2029-12-31T00:00:00Z"),
    (window) => {
      window.Date.now = () => now;
    },
  );
  const document = dom.window.document;
  assert.equal(
    document.querySelector('#active [data-countdown-part="days"]').textContent,
    "01",
  );
  assert.equal(
    document.querySelector('#active [data-countdown-part="hours"]').textContent,
    "02",
  );
  assert.equal(
    document.querySelector('#active [data-countdown-part="seconds"]')
      .textContent,
    "04",
  );
  assert.equal(
    document.querySelector("#active [data-countdown-content]").hidden,
    false,
  );
  assert.equal(
    document.querySelector("#ended [data-countdown-content]").hidden,
    true,
  );
  assert.equal(
    document.querySelector("#ended [data-countdown-ended]").hidden,
    false,
  );
  dom.window.BnfsjSections.destroy();
  dom.window.close();
});

test("section reinitialization is idempotent and removing a section releases its timer", async () => {
  let started = 0;
  const cleared = [];
  const dom = page(countdown("timer", "2030-01-02T00:00:00Z"), (window) => {
    window.Date.now = () => Date.parse("2030-01-01T00:00:00Z");
    window.setInterval = () => ++started;
    window.clearInterval = (id) => cleared.push(id);
  });
  dom.window.BnfsjSections.initialize();
  dom.window.dispatchEvent(new dom.window.Event("content:loaded"));
  assert.equal(started, 1);
  dom.window.document.getElementById("timer").remove();
  await Promise.resolve();
  assert.deepEqual(cleared, [1]);
  dom.window.close();
});

test("malformed countdown dates leave editable content intact and do not start timers", () => {
  const dom = page(countdown("invalid", "not-a-date"), (window) => {
    window.setInterval = () => {
      throw new Error("No timer should start");
    };
  });
  assert.equal(
    dom.window.document.querySelector("[data-countdown-content]").hidden,
    false,
  );
  assert.equal(
    dom.window.document.querySelector("[data-countdown-ended]").hidden,
    true,
  );
  dom.window.close();
});

test("multiple carousel instances initialize once and clean up independently", () => {
  const started = [];
  const stopped = [];
  const dom = page(
    '<div id="one" data-bnfsj-carousel="partners"><img><img></div><div id="two" data-bnfsj-carousel="main"><img><img></div>',
    (window) => {
      window.jQuery = (element) => ({
        slick(options) {
          if (options === "unslick") stopped.push(element.id);
          else started.push({ id: element.id, options });
        },
        hasClass: () => true,
      });
      window.jQuery.fn = { slick() {} };
    },
  );
  dom.window.BnfsjSections.initialize();
  assert.deepEqual(
    started.map((x) => x.id),
    ["one", "two"],
  );
  assert.equal(started[0].options.rtl, true);
  assert.equal(
    started[1].options.autoplay,
    false,
    "reduced-motion disables autoplay",
  );
  dom.window.BnfsjSections.destroy(dom.window.document.getElementById("one"));
  assert.deepEqual(stopped, ["one"]);
  dom.window.BnfsjSections.destroy();
  assert.deepEqual(stopped, ["one", "two"]);
  dom.window.close();
});
