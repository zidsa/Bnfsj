import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

import { createSelectionController } from "../src/product/product-selection.js";
import { createActionController } from "../src/product/product-actions.js";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");

function page() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <section data-bnfsj-product>
      <input id="product-parent-id" value="parent-1">
      <div id="product-variants-options">
        <ul data-option-id="color">
          <li value="Sand" class="active"><button type="button" value="Sand" aria-pressed="true">Sand</button></li>
          <li value="Lavender"><button type="button" value="Lavender">Lavender</button></li>
        </ul>
      </div>
      <div id="product-custom-user-input-fields"><input id="engraving" value=""></div>
    </section>
  </body></html>`);
  return {
    dom,
    root: dom.window.document.querySelector("[data-bnfsj-product]"),
  };
}

function click(button) {
  return {
    currentTarget: button,
    preventDefault() {},
  };
}

test("a failed current lookup rejects waiting actions and keeps pressed state aligned", async () => {
  const { dom, root } = page();
  const pending = [];
  const controller = createSelectionController({
    root,
    getSdk: () =>
      Promise.resolve({
        products: {
          getProductOptions: () => Promise.reject(new Error("lookup failed")),
        },
      }),
    onProduct: () => {},
    onPending: (delta) => pending.push(delta),
  });
  let buyNowCalls = 0;
  const actions = createActionController({
    root,
    getSelected: () => ({ id: "previous", in_stock: true }),
    quantity: { set: (value) => value },
    getSdk: () =>
      Promise.resolve({
        cart: {
          buyNow: () => {
            buyNowCalls += 1;
            return Promise.resolve({});
          },
        },
      }),
    global: dom.window,
    waitForSelection: controller.wait,
  });
  const choice = root.querySelectorAll("button")[1];

  await assert.rejects(
    controller.optionClicked(click(choice)),
    /lookup failed/,
  );
  await assert.rejects(controller.wait(), /lookup failed/);
  await assert.rejects(actions.buyNow(), /lookup failed/);
  assert.equal(buyNowCalls, 0);
  assert.equal(choice.closest("li").classList.contains("active"), true);
  assert.equal(choice.getAttribute("aria-pressed"), "true");
  assert.equal(
    root
      .querySelector("li")
      .querySelector("button")
      .getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(choice.hasAttribute("aria-selected"), false);
  assert.deepEqual(pending, [1, -1]);
  controller.destroy();
});

test("a missing SDK lookup rejects the current intent", async () => {
  const { root } = page();
  const controller = createSelectionController({
    root,
    getSdk: () => Promise.resolve(null),
    onProduct: () => {},
  });
  const choice = root.querySelectorAll("button")[1];

  await assert.rejects(
    controller.optionClicked(click(choice)),
    /lookup unavailable/,
  );
  await assert.rejects(controller.wait(), /lookup unavailable/);
  controller.destroy();
});

test("a later successful lookup clears a previous failed intent", async () => {
  const { root } = page();
  let attempts = 0;
  const applied = [];
  const controller = createSelectionController({
    root,
    getSdk: () =>
      Promise.resolve({
        products: {
          getProductOptions: () => {
            attempts += 1;
            return attempts === 1
              ? Promise.reject(new Error("unavailable"))
              : Promise.resolve({ id: "variant-2", in_stock: true });
          },
        },
      }),
    onProduct: (value) => applied.push(value.id),
  });
  const choice = root.querySelectorAll("button")[1];

  await assert.rejects(controller.optionClicked(click(choice)), /unavailable/);
  await assert.doesNotReject(controller.optionClicked(click(choice)));
  await assert.doesNotReject(controller.wait());
  assert.deepEqual(applied, ["variant-2"]);
  controller.destroy();
});

test("wait follows a newer debounced edit instead of the canceled promise", async () => {
  const { dom, root } = page();
  const calls = [];
  const controller = createSelectionController({
    root,
    debounceMs: 20,
    getSdk: () =>
      Promise.resolve({
        products: {
          getProductOptions: (_id, payload) => {
            calls.push(payload.input_fields.slice());
            return Promise.resolve({ id: "variant-2" });
          },
        },
      }),
    onProduct: () => {},
  });
  let addCalls = 0;
  const actions = createActionController({
    root,
    getSelected: () => ({ id: "variant-2", in_stock: true }),
    quantity: { set: (value) => value },
    getSdk: () =>
      Promise.resolve({
        cart: {
          addProduct: () => {
            addCalls += 1;
            return Promise.resolve({});
          },
        },
      }),
    global: dom.window,
    waitForSelection: controller.wait,
  });
  controller.installGlobals(dom.window);
  const input = root.querySelector("#engraving");
  input.value = "first";
  const firstEdit = dom.window.productOptionInputChanged({
    currentTarget: input,
  });
  const buying = actions.add();
  await new Promise((resolve) => setTimeout(resolve, 5));
  input.value = "second";
  const secondEdit = dom.window.productOptionInputChanged({
    currentTarget: input,
  });

  await Promise.all([firstEdit, secondEdit, buying]);
  assert.deepEqual(calls, [["engraving"]]);
  assert.equal(addCalls, 1);
  controller.destroy();
});

test("destroy cancels scheduled edits without leaving pending work", async () => {
  const { dom, root } = page();
  const pending = [];
  const controller = createSelectionController({
    root,
    debounceMs: 100,
    getSdk: () => Promise.resolve({}),
    onProduct: () => {},
    onPending: (delta) => pending.push(delta),
  });
  controller.installGlobals(dom.window);
  const input = root.querySelector("#engraving");
  input.value = "draft";
  const edit = dom.window.productOptionInputChanged({ currentTarget: input });
  controller.destroy();

  await edit;
  await assert.rejects(controller.wait(), /destroyed/);
  assert.deepEqual(pending, []);
});
