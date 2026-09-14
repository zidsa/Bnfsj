# Bnfsj 1.1.1 QA

Date: 2026-09-10. Scope: two demonstration pages in a testing environment.

## Source and package

- 12 Python tests pass, including real composition of all 18 section types in
  Arabic and English, arbitrary IDs/order, repeated countdowns, hidden sections,
  absent images, grouped defaults, and zero radius.
- 18 JavaScript assertions across four test files pass. Coverage includes
  inventory limits, newest-response selection, failed lookup blocking, retry,
  debounced custom fields with a waiting cart action, double-submit prevention,
  out-of-stock transitions, cleanup, and independent countdown/carousel instances.
- The deterministic ZIP contains 152 files and 101 assets (589,114 bytes).
  All 98 original sample asset hashes are unchanged.
- Both Arabic and English ZIP validation pass: native Jinja compilation and
  rendering, schemas, bundled browser entry, local references, archive paths, CRC,
  package size, and per-asset size.
- Desktop and 390px local previews were visually inspected. Marketing images,
  responsive grids, spacing, sticky controls, and RTL/LTR are rendered through
  the same shared CSS. No horizontal overflow was observed.

Local validation stubs native Vitrin partials. It does not replace the deployed
SDK/editor/checkout verification below. The local product fixture is Madar, even
when rendering another page's settings.

## Page configurations

- Madar: ten sections, Royal palette.
- Nawa: six sections, lavender primary with dark contrasting button text.

Each page uses independent settings with the same reusable theme. The Madar
CSS patch is replaced by shared settings. Legacy font/custom-CSS fallbacks
remain in the layout.

## Browser record

- Both pages serve `data-bnfsj-version="1.1.1"`. Fresh page console captures
  contain no errors.
- Madar renders ten sections with the Royal palette; Nawa renders six with
  independent theme settings. The native editor exposes the new grouped font,
  color, radius, width, and spacing controls with persisted values.
- Madar was inspected in Arabic and English at 1440px and 390px. Nawa was
  inspected in English at 390px and Arabic at 1440px. No horizontal overflow
  was observed. All 12 payment icons load from their original URLs.
- Keyboard selection of Madar Lavender updates the gallery and pressed state.
  Buy Now at quantity 2 reaches checkout with Madar Lavender ×2.
- Nawa Lavender at quantity 3 reaches checkout with total quantity 3. The
  store promotion splits it into quantity-2 and quantity-1 rows as expected.
- The quantity field clamps 0 to 1 and 101 to 100 for the demo inventory.
  Finite-stock clamping is verified separately in runtime tests.
- Both locale buttons preserve their landing page and switch content/direction.
- Test cart items were removed after verification. No order was submitted or
  payment charged.

## Release findings

The first live check exposed a CDN restriction: cross-origin ES-module requests
are unsupported by the asset host. Source stays modular, while pinned esbuild
now produces one classic browser bundle. The exact shipped bundle is exercised
by a DOM integration test. Payment icons use original URLs because the image
transformation proxy could not load the testing static icons.

## Dynamic bundle support (1.2.0)

Added after the 1.1.1 browser record, verified locally only. Asset cache-busters
and `data-bnfsj-version` move to 1.2.0.

- 20 JavaScript tests pass, including two new bundle cases: a bundle blocks the
  cart before selections arrive and while they are incomplete, releases the
  purchase button and Apple Pay once the kit reports a valid selection, sends
  `sub_items` with `form_id`, publishes `bundleCartPayload` and
  `sub_items_payload`, restores the global on destroy, gates from
  `productObj.product_class` when the section marker is absent, and leaves plain
  products submitting `form_id` alone.
- 12 Python tests pass. Arabic and English source validation and ZIP validation
  pass; the ZIP contains 152 files and 101 assets (591,746 bytes).
- Rendering with a fixture carrying `product_class: dynamic_bundle` confirms the
  section marker, the bundle container, and the server-side disabled purchase
  button. A plain fixture renders unchanged markup.
- Not verified: the deployed bundle kit itself. Local validation stubs
  `vitrin:products/bundle-products.jinja`, so live selection UI, event timing,
  and a real bundle order still need a store check.

### Stale-runtime finding

A store check showed a bundle Buy Now button carrying the `disabled` class
without the `disabled` attribute, and a click still sending
`{form_id: "product-form"}` with no sub-items. Replaying the 1.1.1 and 1.2.0
bundles against the current markup in JSDOM reproduced it: 1.1.1 clears the
attribute it does not understand and leaves the class, so the page was serving
new templates with the previously cached runtime. Bootstrap's `.disabled` class
does not block clicks on a `<button>`, so the button stayed live.

The gate is now layered: an inline `pointer-events:none` lock on the purchase
controls that only a bundle-aware runtime clears, a bundle re-check in the click
handler, and the existing refusal inside the cart action. Browser hit-testing
enforces the inline lock, so that layer is not reproducible in JSDOM and was not
asserted; the click-handler and cart-action layers are covered by tests. Ship
bundle asset changes as a new theme version rather than an in-place push.

### Stale published asset finding

A store reported `data-bnfsj-version` at 1.2.0 with `window.bnfsjProduct.bundle`
undefined: new templates against the previously published runtime. The platform's
`asset_url` builds paths from the theme version id, and the store's asset
directory and `?v=` token were unchanged across every report, so an in-place push
had shipped templates while that version's assets stayed. Only a new theme
version changes the directory. `data-bnfsj-version` is therefore not a signal for
asset freshness; `!!window.bnfsjProduct.bundle` is.

A bundle page now carries an inline shim for that case. Rendering the bundle page
and executing it in JSDOM against the previous runtime confirms an incomplete
selection stays locked and submits nothing even when the disabled attribute is
forced off, a complete selection releases the controls and submits
`sub_items` with `form_id`, and the shim stands down under the current runtime
with exactly one submission and no double add. That scenario mixes a rendered
template with an older asset, so it is not part of the automated suite; the
runtime-side layers are.

### Event replay finding

A locked button after a completed selection exposed a second gap: the kit's event
bridge has no replay, so a selection emitted before the deferred runtime attached
its listener was lost and the gate never opened. The landing page now captures
selections in an inline listener and the runtime adopts that state at startup.
Rendering the bundle page and executing it in JSDOM with the shipped runtime
confirms both orderings release the controls and send
`sub_items` with `form_id`: the kit emitting before the runtime bundle executes,
and after. 21 JavaScript tests pass, including a replay case.

## Limits

No real order or payment is required for this verification. Stock-alert email
sending, Apple Pay execution, and live custom-field products are not exercised;
the selection/custom-field concurrency behavior is covered by isolated tests.
Verification was limited to the testing environment.
