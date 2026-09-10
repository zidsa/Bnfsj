import assert from "node:assert/strict";
import test from "node:test";

import { createRequestGate } from "../src/product/product-selection.js";
import { clampQuantity, quantityLimit } from "../src/product/product-quantity.js";
import { createActionController } from "../src/product/product-actions.js";

test("quantity is capped by finite variant stock and preserves the 100-item platform cap", () => {
  assert.equal(quantityLimit({ is_infinite: false, quantity: 3 }), 3);
  assert.equal(clampQuantity(10, { is_infinite: false, quantity: 3 }), 3);
  assert.equal(quantityLimit({ is_infinite: false, quantity: 300 }), 100);
  assert.equal(clampQuantity("٤", { is_infinite: false, quantity: 8 }), 1);
  assert.equal(clampQuantity(2.9, { is_infinite: true }), 2);
});

test("request gate applies only the newest asynchronous response", async () => {
  const gate = createRequestGate();
  const applied = [];
  let resolveFirst;
  const first = gate.run(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    (value) => applied.push(value),
  );
  const second = gate.run(
    () => Promise.resolve("new"),
    (value) => applied.push(value),
  );
  assert.equal(await second, "new");
  resolveFirst("old");
  assert.equal(await first, null);
  assert.deepEqual(applied, ["new"]);
});

test("request gate keeps the current request error visible while suppressing stale errors", async () => {
  const gate = createRequestGate();
  let rejectOld;
  const old = gate.run(
    () =>
      new Promise((_, reject) => {
        rejectOld = reject;
      }),
  );
  const current = gate.run(() => Promise.reject(new Error("current")));
  await new Promise((resolve) => setTimeout(resolve, 0));
  rejectOld(new Error("stale"));
  assert.equal(await old, null);
  await assert.rejects(current, /current/);
});

test("action controller locks before awaiting the SDK and rejects duplicate submits", async () => {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  globalThis.window = {
    dispatchEvent() {},
    CustomEvent: globalThis.CustomEvent,
  };
  let release;
  let calls = 0;
  const root = { querySelector: () => ({ value: "2" }) };
  const controller = createActionController({
    root,
    getSelected: () => ({ id: "variant-1", in_stock: true, is_infinite: true }),
    quantity: {
      set(value) {
        return value;
      },
    },
    getSdk: () =>
      Promise.resolve({
        cart: {
          addProduct: () => {
            calls += 1;
            return new Promise((resolve) => {
              release = resolve;
            });
          },
        },
      }),
  });
  const first = controller.add();
  const second = controller.add();
  assert.equal(await second, false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  release({ ok: true });
  assert.equal(await first, true);
  assert.equal(controller.isBusy(), false);
});
