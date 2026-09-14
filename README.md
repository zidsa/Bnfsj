# Bnfsj

A reusable native Vitrin product landing theme. Each page selects one product and
has its own settings profile. Madar and Nawa demonstrate two pages using the same
templates, styles, and purchase flow.

## Design and composition

`layout.schema.json` exposes typography, semantic colors, content width, section
spacing, and corner radius in the merchant editor. Grouped keys such as
`theme_primary` become `--bnfsj-primary` CSS variables in `layout.jinja`.
`assets/bnfsj.css` owns the shared design. Sections inherit those defaults and can
use their existing section color settings as overrides. Royal `#3C1C54` is the
default primary color; page profiles can choose another palette.

All 18 section template paths and existing section setting keys are preserved.
Marketing sections may be reordered, hidden, or repeated with arbitrary section
IDs. The native landing-page contract supports one product section per page.
`templates/landing.jinja` composes the native `template_components` and shared
purchase bar. Product markup is split into focused includes in `components/`.
The Madar example contains ten sections and content/settings only; it does not
need page-specific CSS or selectors tied to its IDs.

`assets/bnfsj-sections.js` initializes carousels and countdowns within each section,
handles sections inserted or removed by the editor, and cleans up timers. It
exposes `window.BnfsjSections.initialize(root)` and `.destroy(root)`; repeated
initialization is safe. Reduced-motion preferences disable carousel autoplay.

## Product behavior

`src/product-entry.js` composes reusable ES modules in `src/product/`. The build
bundles them into `assets/bnfsj-product.js`, a single classic browser script that
works with Vitrin’s cross-origin asset CDN. `product-runtime.js` coordinates selection, quantity,
gallery, cart, and stock-alert modules. The public initializer accepts injected
SDK/global/control roots for isolated tests and has a matching `destroy()`.

Selection waits for the latest option/custom-field request, ignores stale
responses, and prevents checkout after a failed lookup. Quantity follows finite
variant inventory with the platform's 100-item cap. Cart operations have a shared
submission lock. The existing native globals and form selectors are retained for
Vitrin custom-field and checkout integration. Native Apple Pay and custom-field
markup remain platform partials.

A `dynamic_bundle` product renders the platform bundle kit and gets `data-bnfsj-bundle`
on the product section. `product-bundle.js` listens for
`vitrin:bundle-selections:updated`, publishes the payload as `window.bundleCartPayload`
and `selected_product.sub_items_payload` for quick checkout, and re-dispatches
`bnfsj:bundle:updated`. Purchase buttons ship disabled for a bundle and stay
disabled, along with Apple Pay quick checkout, until the kit reports a complete
selection; the cart submission then carries `sub_items` alongside `form_id`.

Bundle gating fails closed at three levels, because an incomplete bundle must
never reach the cart. The template renders `data-bnfsj-purchase-lock` with an
inline `pointer-events:none` on the purchase controls, which the runtime clears
only for a valid selection; a stale cached runtime therefore blocks the click
instead of submitting without sub-items. The delegated click handler re-checks
the bundle in case other code clears the `disabled` attribute, and the cart
action refuses to submit while the bundle is blocked. Publish bundle-affecting
asset changes as a new theme version: an in-place push leaves browsers holding
the previous `bnfsj-product.js` against new templates.

The kit's event bridge does not replay, so a landing page captures selections in
an inline listener into `window.__bnfsjBundleSelections` and the runtime adopts
that state on initialization. Without it, a kit that emits before the deferred
bundle loads would leave a complete selection behind a locked button.
`window.bnfsjProduct.bundle.status()` reports `isBundle`, `blocked`, `received`,
`valid`, and the current payload for diagnosing a stuck purchase bar on a store.
`!!window.bnfsjProduct.bundle` is the only reliable check for whether a store
serves a bundle-aware runtime; `data-bnfsj-version` comes from the template and
tracks the templates, not the published assets.

A bundle page also carries an inline compatibility shim, because `asset_url`
resolves assets under the theme version directory: an in-place push can ship new
templates against a previously published `bnfsj-product.js`. The shim gates the
purchase controls from the same event and submits `sub_items` itself, refusing
incomplete selections, and stands down as soon as a bundle-aware runtime is
present. Remove it once every store serves 1.2.0 or later.

Variant controls and gallery navigation use native buttons, accessible labels,
visible focus styles, and locale-aware direction. Countdown instances use scoped
data attributes rather than shared element IDs.

## Compatibility

The original 98 sample assets remain byte-for-byte in the package. Active styles
use the shared theme layer plus Bootstrap, Slick, and the existing icon font;
legacy theme CSS is retained as source material but is no longer loaded.
Existing `fonts_name` and `general_settings_css` values remain supported as
fallbacks for older profiles. New profiles use `font_family` and `custom_css`.
Custom CSS is loaded after the shared layer. Avoid page-ID selectors when adding
new features: put reusable presentation in the shared CSS and expose content or
real merchant choices through the adjacent section schema.

## Local validation

Use Python 3.11+ and Node 20+:

```sh
python3 -m pip install 'Jinja2>=3.1,<4' 'pytest>=8,<10'
npm ci --ignore-scripts
python3 -m pytest tests -q
npm test
python3 scripts/validate.py --language ar
python3 scripts/validate.py --language en
python3 scripts/build.py --output dist/bnfsj.zip --manifest dist/assets-manifest.json
python3 scripts/validate.py dist/bnfsj.zip
```

The package builder compiles the browser bundle with pinned esbuild, then creates
a deterministic ZIP while preserving authored templates and styles. Validation
checks paths, schemas, asset references, and real Jinja component
composition. Tests cover every section in Arabic/English, repeated countdowns,
hidden/reordered sections, missing images, independent colors, runtime cleanup,
finite inventory, concurrent selections, failed cart/selection requests, dynamic
bundle gating and sub-item payloads, and the exact bundled browser entry.
The checked-in product fixture contains no customer or credential data.

For a visual preview, use `--html-output /tmp/bnfsj.html`. An optional `--preset`
accepts a JSON object with a `presets` array, matching `preset.json`; wrap the
Madar settings array in that object to preview the example. Platform partials are explicit local stubs;
SDK, localization, editor persistence, and checkout still need testing on Vitrin.

## Publication

Build the ZIP and publish it through the platform's theme workflow. Configure
each landing page independently in the merchant editor. The theme receives the
page's settings from Vitrin and does not require hardcoded deployment identifiers.

Keep deployment identifiers, credentials, and environment-specific operational
notes outside this repository. See [QA.md](QA.md) for the
verification record and [examples/madar/README.md](examples/madar/README.md)
for the ten-section example.
