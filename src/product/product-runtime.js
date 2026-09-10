import { createActionController } from "./product-actions.js";
import { renderGallery, destroyGallery } from "./product-gallery.js";
import { createQuantityController } from "./product-quantity.js";
import { createSelectionController } from "./product-selection.js";

export function initialize(root, config) {
  config = config || {};
  root = root || document.querySelector("[data-bnfsj-product]");
  if (!root) return null;
  if (root.__bnfsjProductRuntime) {
    if (!config.force) return root.__bnfsjProductRuntime;
    root.__bnfsjProductRuntime.destroy();
  }
  var global = config.global || window;
  var controlsRoot = config.controlsRoot || root.ownerDocument;
  var listeners = [];
  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    listeners.push(function () {
      target.removeEventListener(type, handler);
    });
  }
  var waitForSdk =
    config.sdkReady ||
    function (ready) {
      if (global.zid && (!ready || ready(global.zid)))
        return Promise.resolve(global.zid);
      return new Promise(function (resolve) {
        var attempts = 0;
        var timer = global.setInterval(function () {
          if (
            (global.zid && (!ready || ready(global.zid))) ||
            ++attempts >= 400
          ) {
            global.clearInterval(timer);
            resolve(
              global.zid && (!ready || ready(global.zid)) ? global.zid : null,
            );
          }
        }, 25);
      });
    };
  var state = function () {
    return global.productObj || global.__bnfsjProduct || {};
  };
  var selected = function () {
    var value = state();
    return value.selected_product || value;
  };
  var quantity = createQuantityController(root, selected, root.ownerDocument);
  var controlsBusy = 0;
  function busy(value) {
    controlsBusy += typeof value === "number" ? value : value ? 1 : -1;
    controlsBusy = Math.max(0, controlsBusy);
    var locked = controlsBusy > 0;
    root.ownerDocument
      .querySelectorAll(
        "[data-bnfsj-add-to-cart], [data-bnfsj-buy-now], [data-bnfsj-stock-alert]",
      )
      .forEach(function (element) {
        element.disabled =
          locked ||
          (element.matches("[data-bnfsj-add-to-cart], [data-bnfsj-buy-now]") &&
            !actions.available(selected()));
      });
    root.ownerDocument
      .querySelectorAll(".add-to-cart-progress, .send-notify-progress")
      .forEach(function (element) {
        element.classList.toggle("d-none", !locked);
      });
  }
  function updateAvailability(value) {
    var available = actions.available(value);
    root.ownerDocument
      .querySelectorAll(".buying-buttons")
      .forEach(function (element) {
        element.classList.toggle("d-none", !available);
      });
    root
      .querySelectorAll(".section-out-of-stock-notify-me")
      .forEach(function (element) {
        element.classList.toggle("d-none", available);
        element.classList.toggle("d-block", !available);
      });
    root.ownerDocument
      .querySelectorAll("[data-bnfsj-buy-now], [data-bnfsj-add-to-cart]")
      .forEach(function (element) {
        element
          .closest(".js-section-add-to-cart")
          ?.classList.toggle("d-none", !available);
        element.disabled = !available;
      });
    root.ownerDocument
      .querySelectorAll(".js-section-apple-pay-quick-checkout")
      .forEach(function (element) {
        element.classList.toggle("d-none", !available);
      });
  }
  function applyProduct(value) {
    var current = state();
    current.selected_product = value;
    global.productObj = current;
    value.custom_fields_payload = customFieldsPayload();
    var id = root.querySelector("#product-id");
    if (id) {
      id.value = value.id || "";
      id.setAttribute("value", id.value);
    }
    root
      .querySelectorAll(".send-notify-product-id")
      .forEach(function (element) {
        element.value = value.id || "";
        element.setAttribute("value", element.value);
      });
    var price = root.querySelector(".product-formatted-price");
    var old = root.querySelector(".product-formatted-price-old");
    var discount = root.querySelector(".product-formatted-price-discount");
    if (price)
      price.textContent =
        value.formatted_sale_price || value.formatted_price || "";
    if (old)
      old.textContent = value.formatted_sale_price ? value.formatted_price : "";
    if (discount)
      discount.textContent = value.formatted_sale_price
        ? (discount.dataset.discountLabel || "Discount") +
          " " +
          (value.discount_percentage || 0) +
          "%"
        : "";
    quantity.updateLimit(value);
    updateAvailability(value);
    renderGallery(root, value, root.ownerDocument);
    global.dispatchEvent(
      new global.CustomEvent("bnfsj:product:updated", { detail: value }),
    );
  }
  function customFieldsPayload() {
    if (typeof global.extractCustomFieldsPayload === "function")
      return global.extractCustomFieldsPayload();
    var fields = [];
    root
      .querySelectorAll(
        '#product-custom-user-input-fields input:not([type="file"]), #product-custom-user-input-fields textarea',
      )
      .forEach(function (input) {
        if (!input.value) return;
        fields.push({
          price_settings: input.id,
          group_name: null,
          group_id: input.id,
          name: input.name || input.id,
          value: input.value,
          type: input.getAttribute("data-type") || "TEXT",
        });
      });
    root
      .querySelectorAll(".product-custom-user-option-fields-group")
      .forEach(function (group) {
        var container = root.querySelector(
          '[option-id="product-custom-user-option-fields-group-' +
            group.value +
            '"]',
        );
        if (!container) return;
        container
          .querySelectorAll('input[type="checkbox"]:checked')
          .forEach(function (input) {
            fields.push({
              price_settings: { [group.value]: input.id },
              group_name: group.name || null,
              group_id: group.value,
              name: input.name || input.id,
              value: "✔",
              type: "CHECKBOX",
            });
          });
      });
    root
      .querySelectorAll("#product-custom-user-dropdown-fields select")
      .forEach(function (select) {
        var option = select.options[select.selectedIndex];
        if (option && select.selectedIndex > 0)
          fields.push({
            price_settings: { [select.id]: option.id },
            group_name: select.name || null,
            group_id: select.id,
            name: option.value,
            value: "✔",
            type: "DROPDOWN",
          });
      });
    return fields;
  }
  var selection = createSelectionController({
    root: root,
    getSdk: waitForSdk,
    onProduct: applyProduct,
    onPending: busy,
  });
  var actions = createActionController({
    root: root,
    getSelected: selected,
    quantity: quantity,
    getSdk: waitForSdk,
    redirectPath: config.redirectPath,
    onBusy: busy,
    global: global,
    waitForSelection: selection.wait,
  });
  var restoreSelection = selection.installGlobals(global);
  var actionNames = [
    "bnfsjProductBuyNow",
    "bnfsjProductAddToCart",
    "bnfsjProductStockAlert",
  ];
  var previousActions = actionNames.map(function (name) {
    return { name: name, value: global[name] };
  });
  global.bnfsjProductBuyNow = actions.buyNow;
  global.bnfsjProductAddToCart = actions.add;
  global.bnfsjProductStockAlert = actions.stockAlert;
  listen(root.ownerDocument, "click", function (event) {
    var target =
      event.target.closest &&
      event.target.closest(
        "[data-bnfsj-buy-now], [data-bnfsj-add-to-cart], [data-bnfsj-stock-alert], [data-bnfsj-quantity-increase], [data-bnfsj-quantity-decrease], .thumb-image-a",
      );
    if (!target || (!root.contains(target) && !controlsRoot.contains(target)))
      return;
    if (target.matches("[data-bnfsj-buy-now]"))
      return void actions.buyNow().catch(function () {});
    if (target.matches("[data-bnfsj-add-to-cart]"))
      return void actions.add().catch(function () {});
    if (target.matches("[data-bnfsj-stock-alert]"))
      return void actions.stockAlert().catch(function () {});
    if (target.matches("[data-bnfsj-quantity-increase]"))
      return void quantity.set(
        Number(root.querySelector("#product-quantity")?.value || 1) + 1,
      );
    if (target.matches("[data-bnfsj-quantity-decrease]"))
      return void quantity.set(
        Number(root.querySelector("#product-quantity")?.value || 1) - 1,
      );
    if (target.matches(".thumb-image-a")) {
      var carousel = root.querySelector("#product-images-slick");
      var jq = global.jQuery;
      if (carousel && jq && jq.fn && jq.fn.slick)
        jq(carousel).slick(
          "slickGoTo",
          Number(target.getAttribute("data-index")) || 0,
          true,
        );
    }
  });
  listen(root.ownerDocument, "input", function (event) {
    if (
      (root.contains(event.target) || controlsRoot.contains(event.target)) &&
      (event.target.id === "product-quantity-floating" ||
        event.target.id === "product-quantity")
    )
      quantity.set(event.target.value);
  });
  var initial = selected();
  quantity.set(1);
  if (initial) {
    initial.custom_fields_payload = customFieldsPayload();
    quantity.updateLimit(initial);
    renderGallery(root, initial, root.ownerDocument);
    updateAvailability(initial);
  }
  root.__bnfsjProductRuntime = {
    selection: selection,
    quantity: quantity,
    actions: actions,
    destroy: function () {
      listeners.splice(0).forEach(function (remove) {
        remove();
      });
      selection.destroy();
      destroyGallery(root);
      if (restoreSelection) restoreSelection();
      previousActions.forEach(function (entry) {
        if (entry.value === undefined) delete global[entry.name];
        else global[entry.name] = entry.value;
      });
      delete root.__bnfsjProductRuntime;
    },
  };
  return root.__bnfsjProductRuntime;
}
