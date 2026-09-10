import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { initialize } from "../src/product/product-runtime.js";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");

function fixture(
  selected = {
    id: "variant-1",
    in_stock: true,
    is_infinite: false,
    quantity: 2,
    formatted_price: "10",
  },
) {
  const dom = new JSDOM(
    `<!doctype html><html dir="rtl"><body>
    <section data-bnfsj-product>
      <form id="product-form">
        <input id="product-id" value="${selected.id}"><input id="product-parent-id" value="parent-1">
        <input id="product-quantity" value="1">
        <div id="product-variants-options"><ul data-option-id="color">
          <li class="active"><button type="button" value="Sand" aria-pressed="true" onclick="bnfsjProductOptionClicked(event)">Sand</button></li>
          <li><button type="button" value="Lavender" aria-pressed="false" onclick="bnfsjProductOptionClicked(event)">Lavender</button></li>
        </ul></div>
        <span class="product-formatted-price"></span><del class="product-formatted-price-old"></del><span class="product-formatted-price-discount"></span>
        <div class="product-images-carousel"><div id="product-images-slick"></div></div>
        <div class="product-images-carousel-thumbs"></div><div class="product-images-empty d-none"></div>
        <div class="section-out-of-stock-notify-me d-none"><input class="send-notify-email" value="buyer@example.com"><button data-bnfsj-stock-alert>Send</button></div>
        <div class="js-section-add-to-cart"><button data-bnfsj-add-to-cart>Add</button></div>
      </form>
    </section>
    <div class="buying-buttons"><div class="js-section-add-to-cart"><button data-bnfsj-buy-now>Buy</button></div>
      <button data-bnfsj-quantity-decrease>−</button><input id="product-quantity-floating" value="1"><button data-bnfsj-quantity-increase>+</button>
    </div>
    <div class="js-section-apple-pay-quick-checkout"></div>
  </body></html>`,
    { url: "https://store.test/l/page", runScripts: "dangerously" },
  );
  const root = dom.window.document.querySelector("[data-bnfsj-product]");
  const products = { ...selected, images: [] };
  dom.window.productObj = { id: "parent-1", selected_product: products };
  return { dom, root, products };
}

function setup(selected, sdk) {
  const value = fixture(selected);
  const runtime = initialize(value.root, {
    global: value.dom.window,
    controlsRoot: value.dom.window.document,
    sdkReady: () => Promise.resolve(sdk),
  });
  return { ...value, runtime };
}

test("public initializer handles native button choices and sticky quantity controls", async () => {
  const requests = [];
  const page = setup(undefined, {
    products: {
      getProductOptions: (_id, payload) => {
        requests.push(payload);
        return Promise.resolve({
          id: "variant-2",
          in_stock: true,
          is_infinite: false,
          quantity: 2,
          formatted_price: "12",
          images: [],
        });
      },
    },
  });
  const choice = page.root.querySelectorAll("button")[1];
  choice.dispatchEvent(
    new page.dom.window.MouseEvent("click", { bubbles: true }),
  );
  await page.runtime.selection.wait();
  assert.equal(page.root.querySelector("#product-id").value, "variant-2");
  assert.equal(choice.getAttribute("aria-pressed"), "true");
  assert.equal(page.root.querySelector("li.active button").value, "Lavender");
  assert.deepEqual(requests[0].attributes, { color: "Lavender" });

  const plus = page.dom.window.document.querySelector(
    "[data-bnfsj-quantity-increase]",
  );
  plus.dispatchEvent(
    new page.dom.window.MouseEvent("click", { bubbles: true }),
  );
  assert.equal(
    page.dom.window.document.querySelector("#product-quantity-floating").value,
    "2",
  );
  page.runtime.destroy();
});

test("variant loading releases controls and transitions to out of stock", async () => {
  let release;
  const page = setup(undefined, {
    products: {
      getProductOptions: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    },
  });
  const choice = page.root.querySelectorAll("button")[1];
  choice.dispatchEvent(
    new page.dom.window.MouseEvent("click", { bubbles: true }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    page.dom.window.document.querySelector("[data-bnfsj-buy-now]").disabled,
    true,
  );
  release({
    id: "variant-oos",
    in_stock: false,
    is_infinite: false,
    quantity: 0,
    formatted_price: "12",
    images: [],
  });
  await page.runtime.selection.wait();
  assert.equal(
    page.dom.window.document.querySelector("[data-bnfsj-buy-now]").disabled,
    true,
  );
  assert.equal(
    page.root
      .querySelector(".section-out-of-stock-notify-me")
      .classList.contains("d-none"),
    false,
  );
  assert.equal(
    page.dom.window.document
      .querySelector(".js-section-apple-pay-quick-checkout")
      .classList.contains("d-none"),
    true,
  );
  page.runtime.destroy();
});

test("cart failure unlocks sticky and product actions", async () => {
  const page = setup(undefined, {
    cart: { addProduct: () => Promise.reject(new Error("cart failed")) },
  });
  const add = page.dom.window.document.querySelector(
    "[data-bnfsj-add-to-cart]",
  );
  await assert.rejects(page.runtime.actions.add(), /cart failed/);
  assert.equal(add.disabled, false);
  assert.equal(page.runtime.actions.isBusy(), false);
  page.runtime.destroy();
});

test("initializer is idempotent and destroy permits clean reinitialization", () => {
  const page = setup(undefined, {
    cart: { addProduct: () => Promise.resolve({}) },
  });
  const same = initialize(page.root, {
    global: page.dom.window,
    controlsRoot: page.dom.window.document,
    sdkReady: () => Promise.resolve({}),
  });
  assert.equal(same, page.runtime);
  page.runtime.destroy();
  const next = initialize(page.root, {
    global: page.dom.window,
    controlsRoot: page.dom.window.document,
    sdkReady: () => Promise.resolve({}),
  });
  assert.notEqual(next, page.runtime);
  next.destroy();
});

// Exercise the exact shipped classic script without module loading or CDN fetches.
test("bundled entry initializes in a classic script context", () => {
  const page = fixture();
  const bundle = readFileSync(
    new URL("../assets/bnfsj-product.js", import.meta.url),
    "utf8",
  );
  page.dom.window.eval(bundle);
  assert.equal(typeof page.dom.window.bnfsjProductInitialize, "function");
  assert.ok(page.dom.window.bnfsjProduct);
  const plus = page.dom.window.document.querySelector(
    "[data-bnfsj-quantity-increase]",
  );
  plus.click();
  assert.equal(page.root.querySelector("#product-quantity").value, "2");
  page.dom.window.bnfsjProduct.destroy();
});
