/** Variant/custom-field selection coordinator. */

export function createRequestGate() {
  var sequence = 0;
  var latest = Promise.resolve(null);
  return {
    run: function (task, apply) {
      var current = ++sequence;
      var request = Promise.resolve()
        .then(task)
        .then(
          function (value) {
            if (current === sequence && value) apply(value);
            return current === sequence ? value : null;
          },
          function (error) {
            if (current !== sequence) return null;
            throw error;
          },
        );
      // A selection callback may be invoked from an inline handler without
      // awaiting its promise. Mark the original rejection as observed while
      // preserving the rejected promise for waiters and callers.
      request.catch(function () {});
      // Keep the current request's rejection visible to callers waiting to submit.
      // Only stale requests are converted to a harmless null above.
      latest = request;
      return request;
    },
    wait: function () {
      return latest;
    },
    invalidate: function () {
      sequence += 1;
      latest = Promise.resolve(null);
    },
  };
}

export function createSelectionController(options) {
  var root = options.root;
  var getSdk = options.getSdk;
  var onProduct = options.onProduct;
  var onPending = options.onPending || function () {};
  var doc = root.ownerDocument;
  var view = doc.defaultView;
  var debounceMs = options.debounceMs == null ? 300 : options.debounceMs;
  var gate = createRequestGate();
  var timer = null;
  var pendingDebounce = Promise.resolve(null);
  var cancelDebounce = null;
  var intentVersion = 0;
  var destroyed = false;
  var destroyedError = new Error("Selection controller was destroyed");
  function attributes() {
    var result = {};
    root
      .querySelectorAll("#product-variants-options ul")
      .forEach(function (list) {
        var choice = list.querySelector("li.active");
        if (choice)
          result[
            list.getAttribute("data-option-id") || list.getAttribute("name")
          ] =
            choice.getAttribute("value") ||
            choice
              .querySelector("button, [data-bnfsj-option-choice]")
              ?.getAttribute("value");
      });
    return result;
  }
  function optionFields() {
    var fields = {};
    root
      .querySelectorAll(".product-custom-user-option-fields-group")
      .forEach(function (group) {
        var values = [];
        var container = root.querySelector(
          '[option-id="product-custom-user-option-fields-group-' +
            group.value +
            '"]',
        );
        if (container)
          container
            .querySelectorAll('input[type="checkbox"]:checked')
            .forEach(function (input) {
              values.push(input.id);
            });
        if (values.length) fields[group.value] = values;
      });
    root
      .querySelectorAll("#product-custom-user-dropdown-fields select")
      .forEach(function (select) {
        var option = select.options[select.selectedIndex];
        if (option && select.selectedIndex > 0) fields[select.id] = [option.id];
      });
    return fields;
  }
  function inputFields() {
    var fields = [];
    root
      .querySelectorAll(
        "#product-custom-user-input-fields input, #product-custom-user-input-fields textarea",
      )
      .forEach(function (input) {
        if (input.value && input.value.trim()) fields.push(input.id);
      });
    return fields;
  }
  function request() {
    if (destroyed) return Promise.reject(destroyedError);
    var parent = root.querySelector("#product-parent-id");
    if (!parent) return Promise.resolve(null);
    onPending(1);
    return gate
      .run(function () {
        return getSdk(function (zid) {
          return zid.products && zid.products.getProductOptions;
        }).then(function (zid) {
          if (!zid || !zid.products || !zid.products.getProductOptions)
            throw new Error("Product option lookup unavailable");
          return zid.products
            .getProductOptions(
              parent.value,
              {
                attributes: attributes(),
                input_fields: inputFields(),
                option_fields: optionFields(),
              },
              { showErrorNotification: true },
            )
            .then(function (response) {
              var value =
                response && response.has_variants
                  ? response.selected_product
                  : response;
              if (!value) throw new Error("Selected product is unavailable");
              return value;
            });
        });
      }, onProduct)
      .finally(function () {
        onPending(-1);
      });
  }
  function cancelScheduled() {
    clearTimeout(timer);
    timer = null;
    if (cancelDebounce) cancelDebounce(null);
    cancelDebounce = null;
    pendingDebounce = Promise.resolve(null);
  }
  function requestDebounced() {
    cancelScheduled();
    gate.invalidate();
    intentVersion += 1;
    pendingDebounce = new Promise(function (resolve, reject) {
      cancelDebounce = resolve;
      timer = setTimeout(function () {
        cancelDebounce = null;
        request().then(resolve, reject);
      }, debounceMs);
    });
    return pendingDebounce;
  }
  function optionClicked(event) {
    if (destroyed) return Promise.reject(destroyedError);
    event.preventDefault();
    cancelScheduled();
    gate.invalidate();
    intentVersion += 1;
    var trigger = event.currentTarget;
    var item = trigger && trigger.closest("li");
    var list = item && item.closest("ul");
    if (!list) return Promise.resolve(null);
    list.querySelectorAll("li").forEach(function (choice) {
      choice.classList.remove("active");
    });
    item.classList.add("active");
    list.querySelectorAll('button, [role="option"]').forEach(function (choice) {
      choice.setAttribute(
        "aria-pressed",
        choice.closest("li") === item ? "true" : "false",
      );
    });
    return request().catch(function (error) {
      // Keep the requested choice visible. The rejected wait state prevents
      // purchase until a later selection lookup succeeds.
      throw error;
    });
  }

  function waitForIntent() {
    if (destroyed) return Promise.reject(destroyedError);
    var observedVersion = intentVersion;
    return Promise.all([gate.wait(), pendingDebounce]).then(
      function () {
        if (destroyed) throw destroyedError;
        return observedVersion === intentVersion ? null : waitForIntent();
      },
      function (error) {
        if (destroyed) throw destroyedError;
        return observedVersion === intentVersion
          ? Promise.reject(error)
          : waitForIntent();
      },
    );
  }
  function installGlobals(target) {
    var names = [
      "bnfsjProductOptionClicked",
      "productOptionInputChanged",
      "productOptionInputNumberClean",
      "productOptionInputNumberValidate",
      "productOptionInputFileChanged",
      "productOptionInputFileDelete",
      "waitForVariantChange",
    ];
    var previous = names.map(function (name) {
      return { name: name, value: target[name] };
    });
    target.bnfsjProductOptionClicked = optionClicked;
    target.productOptionInputChanged = function (event) {
      var input = event && event.currentTarget;
      if (input && input.getAttribute("data-type") === "NUMBER")
        input.value = cleanNumber(input.value);
      return requestDebounced().catch(function () {
        return null;
      });
    };
    target.productOptionInputNumberClean = cleanNumber;
    target.productOptionInputNumberValidate = function (event) {
      var key =
        event &&
        (event.key || String.fromCharCode(event.keyCode || event.which));
      if (key && !/[0-9\u0660-\u0669.]/.test(key)) {
        event.preventDefault();
        return false;
      }
      return true;
    };
    target.productOptionInputFileChanged = function (event) {
      var input = event && event.currentTarget;
      if (input && input.files && input.files[0]) {
        var id = input.id;
        var remove = doc.getElementById("file-delete-" + id);
        var name = doc.getElementById("file-name-" + id);
        var upload = doc.getElementById("file-upload-" + id);
        var preview = doc.getElementById("file-preview-" + id);
        if (remove) remove.style.display = "inherit";
        if (name) name.textContent = input.files[0].name;
        if (upload) upload.style.display = "none";
        if (preview && input.getAttribute("data-type") === "IMAGE") {
          var image = preview.querySelector("img");
          if (image && view.URL && view.URL.createObjectURL)
            image.src = view.URL.createObjectURL(input.files[0]);
          preview.style.display = "inherit";
        }
      }
      return requestDebounced().catch(function () {
        return null;
      });
    };
    target.productOptionInputFileDelete = function (event) {
      event.preventDefault();
      var trigger = event.currentTarget;
      var id = trigger.getAttribute("data-input-id");
      var input = doc.getElementById(id);
      if (input) input.value = "";
      var name = doc.getElementById("file-name-" + id);
      var upload = doc.getElementById("file-upload-" + id);
      var preview = doc.getElementById("file-preview-" + id);
      if (name) name.textContent = name.getAttribute("data-hint-text") || "";
      if (upload) upload.style.display = "inherit";
      if (preview) preview.style.display = "none";
      trigger.style.display = "none";
      return requestDebounced().catch(function () {
        return null;
      });
    };
    target.waitForVariantChange = function () {
      return waitForIntent();
    };
    return function () {
      previous.forEach(function (entry) {
        if (entry.value === undefined) delete target[entry.name];
        else target[entry.name] = entry.value;
      });
    };
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    intentVersion += 1;
    cancelScheduled();
    gate.invalidate();
  }
  return {
    request: request,
    optionClicked: optionClicked,
    installGlobals: installGlobals,
    destroy: destroy,
    wait: waitForIntent,
  };
}

export function cleanNumber(value) {
  return String(value == null ? "" : value)
    .replace(/[^\d\u0660-\u0669.]/g, "")
    .replace(/\.(?=.*\.)/g, "");
}
