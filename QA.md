# Bnfsj 1.1.1 QA

Date: 2026-09-10. Scope: two demonstration pages in a testing environment.

## Source and package

- 13 Python tests pass, including real composition of all 18 section types in
  Arabic and English, arbitrary IDs/order, repeated countdowns, hidden sections,
  absent images, grouped defaults, zero radius, and an unrelated product without
  variants in both languages.
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
when rendering another page's settings, unless `--fixture` supplies another
product. Its identifiers are synthetic and its demo images are bundled locally.

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

## Limits

No real order or payment is required for this verification. Stock-alert email
sending, Apple Pay execution, and live custom-field products are not exercised;
the selection/custom-field concurrency behavior is covered by isolated tests.
Verification was limited to the testing environment.
