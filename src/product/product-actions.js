/** Cart and stock-alert adapter with one lock per landing-page product. */

export function createActionController(options) {
  var root = options.root;
  var getSelected = options.getSelected;
  var quantity = options.quantity;
  var getSdk = options.getSdk;
  var global = options.global || window;
  var bundle = options.bundle || null;
  var waitForSelection =
    options.waitForSelection ||
    function () {
      return Promise.resolve();
    };
  var redirectPath =
    options.redirectPath || "/checkout/choose-address-and-shipping";
  var busy = false;
  var onBusy = options.onBusy || function () {};
  function available(value) {
    if (!value) return false;
    if (
      value.out_of_stock ||
      value.unavailable ||
      value.in_stock === false ||
      value.is_in_stock === false
    )
      return false;
    return !(value.quantity === 0 && value.is_infinite === false);
  }
  function lock(task) {
    if (busy) return Promise.resolve(false);
    busy = true;
    onBusy(true);
    return Promise.resolve()
      .then(task)
      .finally(function () {
        busy = false;
        onBusy(false);
      });
  }
  function cartPayload() {
    var input = root.querySelector("#product-quantity");
    quantity.set(input ? input.value : 1);
    var payload = { form_id: "product-form" };
    return bundle ? bundle.apply(payload) : payload;
  }
  function submitCart(checkout) {
    return lock(function () {
      return getSdk(function (zid) {
        return zid.cart && zid.cart.addProduct;
      }).then(function (zid) {
        if (!zid || !zid.cart || !zid.cart.addProduct) return false;
        return waitForSelection().then(function () {
          if (!available(getSelected())) return false;
          if (bundle && bundle.blocked()) return false;
          return zid.cart
            .addProduct(cartPayload(), { showErrorNotification: true })
            .then(function (result) {
              if (checkout) {
                global.location.href = redirectPath;
                return result;
              }
              global.dispatchEvent(
                new global.CustomEvent("bnfsj:cart:added", { detail: result }),
              );
              return true;
            });
        });
      });
    });
  }
  function add() {
    return submitCart(false);
  }
  function buyNow() {
    return submitCart(true);
  }
  function stockAlert() {
    return lock(function () {
      return waitForSelection().then(function () {
        var selected = getSelected();
        if (available(selected)) return false;
        var email = root.querySelector(".send-notify-email");
        if (!email || !email.value) {
          if (email) email.focus();
          return false;
        }
        return getSdk(function (zid) {
          return zid.products && zid.products.stockAlerts;
        }).then(function (zid) {
          if (!zid || !zid.products || !zid.products.stockAlerts) return false;
          var phone = root.querySelector(".send-notify-phone");
          var prefix = root.querySelector(".send-notify-country-key");
          return zid.products
            .stockAlerts(
              { product_id: selected.id },
              {
                customer_email: email.value,
                customer_name:
                  (root.querySelector(".send-notify-name") || {}).value || "",
                customer_phone_number:
                  phone && phone.value
                    ? "+" + ((prefix && prefix.value) || "966") + phone.value
                    : null,
              },
              { showErrorNotification: true },
            )
            .then(function () {
              return true;
            });
        });
      });
    });
  }
  return {
    add: add,
    buyNow: buyNow,
    stockAlert: stockAlert,
    available: available,
    isBusy: function () {
      return busy;
    },
  };
}
