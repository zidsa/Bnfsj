/** Dynamic bundle selections reported by Vitrin's bundle kit. */

// The bundle UI is a platform partial. It publishes selections on this event.
export var BUNDLE_EVENT = "vitrin:bundle-selections:updated";
export var BUNDLE_CLASS = "dynamic_bundle";
// The kit's event bridge has no replay, so the template captures selections
// here and the deferred runtime adopts whatever already happened.
export var BUNDLE_CAPTURE = "__bnfsjBundleSelections";

export function createBundleController(options) {
  options = options || {};
  var root = options.root;
  var global = options.global || window;
  var getState =
    options.getState ||
    function () {
      return global.productObj || {};
    };
  var onChange = options.onChange || function () {};
  var payload = null;
  var valid = false;
  var received = false;
  var hadGlobal = "bundleCartPayload" in global;
  var previousGlobal = global.bundleCartPayload;
  // The section marks bundle pages server-side. productObj and a received
  // selection event are fallbacks when that marker is missing.
  function isBundle() {
    if (received) return true;
    if (root && root.hasAttribute && root.hasAttribute("data-bnfsj-bundle"))
      return true;
    var state = getState() || {};
    return state.product_class === BUNDLE_CLASS;
  }
  function adopt(data) {
    if (!data) return false;
    payload = data.cartPayload || null;
    valid = data.isSelectionsValid === true;
    received = true;
    // Shared global name with the platform scripts and the other Vitrin themes.
    global.bundleCartPayload = payload;
    var selected = (getState() || {}).selected_product;
    if (selected)
      selected.sub_items_payload = (payload && payload.sub_items) || [];
    return true;
  }
  function handle(event) {
    adopt((event && event.detail && event.detail.data) || {});
    global[BUNDLE_CAPTURE] = { cartPayload: payload, isSelectionsValid: valid };
    onChange({ payload: payload, valid: valid });
    global.dispatchEvent(
      new global.CustomEvent("bnfsj:bundle:updated", {
        detail: { payload: payload, valid: valid },
      }),
    );
  }
  global.addEventListener(BUNDLE_EVENT, handle);
  // Replay a selection that arrived before this runtime was initialized. The
  // caller applies the state right after construction, so no onChange here.
  adopt(global[BUNDLE_CAPTURE]);
  return {
    isBundle: isBundle,
    // An incomplete bundle must never reach the cart.
    blocked: function () {
      return isBundle() && !valid;
    },
    payload: function () {
      return payload;
    },
    isValid: function () {
      return valid;
    },
    received: function () {
      return received;
    },
    // Readable state for diagnosing a blocked purchase bar on a live store.
    status: function () {
      return {
        isBundle: isBundle(),
        blocked: isBundle() && !valid,
        received: received,
        valid: valid,
        payload: payload,
      };
    },
    // A form_id submission keeps only sub_items from here; the SDK reads the rest of the form.
    apply: function (base) {
      if (!payload) return base;
      var merged = {};
      Object.keys(payload).forEach(function (key) {
        merged[key] = payload[key];
      });
      Object.keys(base || {}).forEach(function (key) {
        merged[key] = base[key];
      });
      return merged;
    },
    destroy: function () {
      global.removeEventListener(BUNDLE_EVENT, handle);
      if (hadGlobal) global.bundleCartPayload = previousGlobal;
      else delete global.bundleCartPayload;
    },
  };
}
