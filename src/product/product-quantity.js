/** Quantity state for the single product landing page. */

export function quantityLimit(selected) {
  if (!selected || selected.is_infinite !== false) return 100;
  var quantity = Math.floor(Number(selected.quantity));
  return Number.isFinite(quantity) && quantity > 0
    ? Math.min(quantity, 100)
    : 1;
}

export function clampQuantity(value, selected) {
  var number = Math.floor(Number(value) || 1);
  return Math.max(1, Math.min(quantityLimit(selected), number));
}

export function createQuantityController(root, getSelected, doc) {
  doc = doc || root.ownerDocument;
  function hidden() {
    return root.querySelector("#product-quantity");
  }
  function floating() {
    return doc.getElementById("product-quantity-floating");
  }
  function set(value) {
    var selected = getSelected();
    var number = clampQuantity(value, selected);
    [hidden(), floating()].forEach(function (input) {
      if (!input) return;
      input.value = String(number);
      input.setAttribute("value", String(number));
    });
    if (selected) selected.selected_quantity = number;
    return number;
  }
  function updateLimit(selected) {
    var limit = quantityLimit(selected || getSelected());
    [hidden(), floating()].forEach(function (element) {
      if (element) element.setAttribute("max", String(limit));
    });
    var view = doc.defaultView;
    if (view && typeof view.updateQtyMax === "function") {
      var input = hidden();
      var floatInput = floating();
      if (input) view.updateQtyMax(input.id, limit);
      if (floatInput) view.updateQtyMax(floatInput.id, limit);
    }
    set(hidden() ? hidden().value : 1);
    return limit;
  }
  return {
    set: set,
    updateLimit: updateLimit,
    limit: function () {
      return quantityLimit(getSelected());
    },
  };
}
