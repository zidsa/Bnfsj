# Bnfsj 1.1.1 QA

Date: 2026-09-10. Scope: store 21344 on `hdywzs.zidtest.com` only.

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

## Testing release

Theme: `12a5264d-09ae-49fd-8a0d-d8610d962dfa`.
Version: `1.1.1` / `6ea9e76f-3846-4d9f-81ef-e6ad6b377d7b`.
Installation: `3f6d3a0d-c570-4b33-85c1-ccc01ccacc32`.
Default preset: `fce2049c-1b2b-40c5-b2ff-dfa5e7ef621e`.

- [Madar](https://hdywzs.zidtest.com/l/bnfsj-madar): page
  `f81be0c9-54bc-4f2f-863a-22fb6bd7f421`, profile
  `b02eb3c0-226f-43cb-b4af-a3aeda72e828`; ten sections, Royal palette.
- [Nawa](https://hdywzs.zidtest.com/l/bnfsj-nawa): page
  `45bb3d09-b38f-4865-93c1-201aa5d768eb`, profile
  `2f27c579-4f2d-4d01-8345-6b04c5a55a4c`; six sections, existing lavender
  primary with dark contrasting button text.

Both profiles were exported before the refactor and compared again before
publishing; no concurrent content changes were found. Content, component IDs,
page IDs, and profile IDs are preserved. The Madar CSS patch is replaced by
shared settings. Legacy font/custom-CSS fallbacks remain in the layout.

## Browser record

- Both public pages serve `data-bnfsj-version="1.1.1"` and the final asset
  namespace `6b377d7b`. Fresh page console captures contain no errors.
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
- Cleanup removed only the Madar/Nawa test rows. The original `testing` quantity-2
  and `First Light` quantity-4 items and coupon remained; cart total returned
  to 230.00. No order was submitted or payment charged.
- Madar is open in the in-app browser. Temporary viewport overrides were reset.

## Release findings

The first live check exposed a CDN restriction: cross-origin ES-module requests
are unsupported by the asset host. Source stays modular, while pinned esbuild
now produces one classic browser bundle. The exact shipped bundle is exercised
by a DOM integration test. Payment icons use original URLs because the image
transformation proxy could not load the testing static icons.

Automatic version migration updated the installation but did not invalidate
Vitrin's cached host metadata. The exact Madar testing page was briefly
unpublished and republished using its normal toggle API to refresh that lookup.
Both pages are published with their original IDs and profiles; no infrastructure
cache endpoint, global theme switch, or database fallback was used.

## Limits

No real order or payment is required for this verification. Stock-alert email
sending, Apple Pay execution, and live custom-field products are not exercised;
the selection/custom-field concurrency behavior is covered by isolated tests.
The existing Madar Sand variant has an unrelated secondary honey photo in its
product data; this refactor does not edit product records.

No production mutation, global theme activation, infrastructure deployment,
service restart, or Kubernetes fallback is used for this release.
