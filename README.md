# Bnfsj

A reusable product landing-page template for Zid stores running Vitrin. Use the
same theme for different products, with separate content and design settings for
each page. Arabic, English, product options, quantity, and checkout are supported.

## Use it for your products

Once the theme is available in your store:

1. Create a product landing page and select a product from your catalog.
2. Add and arrange sections in the merchant editor. Keep one product section per
   page; add text, images, features, galleries, or other sections around it.
3. Choose your typography, colors, spacing, and corner styles. Add your own
   marketing copy and images in Arabic and English.
4. Preview both languages on desktop and mobile. Check product options, quantity,
   and checkout before publishing.
5. Create another page for another product and customize it independently.

Product names, prices, stock, variants, and product images come from the selected
catalog product. Store branding and checkout come from Vitrin. You do not need to
edit source code or supply application record IDs for each store or product.

This is a Vitrin theme, so it requires the platform's editor and storefront
runtime. The local preview below shows layout with sample data; it does not run
real checkout.

## Build and starter configurations

The build instructions below create `dist/bnfsj.zip` for the platform's theme
workflow. The repository also includes two optional starting points:

- `preset.json`: a basic six-section layout and shared design defaults.
- `examples/madar/settings.json`: a ten-section design example with sample copy
  and images. See [the example guide](examples/madar/README.md).

Starter configurations are separate from the theme ZIP; the platform's preset
setup or the merchant editor supplies the page sections. Building or uploading
the ZIP does not automatically apply `preset.json`. When no sections have been
configured, the template renders its fallback product section.

The examples and test fixtures are for local development and are excluded from
the upload package. Their section IDs identify section instances within the
sample layout; they are not store or settings-record IDs. Use a unique section
ID for each instance when authoring a configuration with repeated sections.

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

Use Python 3.11+ and Node 20+. Run these commands from the repository root:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install 'Jinja2>=3.1,<4' 'pytest>=8,<10'
npm ci --ignore-scripts
python -m pytest tests -q
npm test
python scripts/validate.py --language ar
python scripts/validate.py --language en
python scripts/build.py --output dist/bnfsj.zip --manifest dist/assets-manifest.json
python scripts/validate.py dist/bnfsj.zip
```

The package builder compiles the browser bundle with pinned esbuild, then creates
a deterministic ZIP while preserving authored templates and styles. Validation
checks paths, schemas, asset references, and real Jinja component
composition. Tests cover every section in Arabic/English, repeated countdowns,
hidden/reordered sections, missing images, independent colors, runtime cleanup,
finite inventory, concurrent selections, and failed cart/selection requests, and the exact bundled browser entry.
The checked-in product fixture uses synthetic product/variant IDs and bundled
demonstration images. It contains no customer or credential data and does not
fetch product records from a store.

For a visual preview, generate HTML and serve the repository locally so image
and stylesheet paths resolve:

```sh
python scripts/validate.py --language en --html-output dist/preview.html
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/dist/preview.html`. Use `--language ar` for Arabic or
`--fixture path/to/sample-product.json` for a different product. Fixtures may
contain a simple product or a product with variants. An optional `--preset`
accepts an object with a `presets` array, matching `preset.json`.

Platform partials are explicit local stubs. SDK behavior, localization, editor
persistence, and checkout still need testing on Vitrin.

`scripts/compare.py` is an optional migration comparison tool, not a build
dependency. It requires your own original Twig sample through `--baseline` and
Twig Composer autoloader through `--twig-autoload` or `BNFSJ_TWIG_AUTOLOAD`.

## Publication

Build the ZIP and publish it through the platform's theme workflow. Configure
each landing page independently in the merchant editor. The theme receives the
page's settings from Vitrin and does not require hardcoded deployment identifiers.

Keep deployment identifiers, credentials, and environment-specific operational
notes outside this repository. See [QA.md](QA.md) for the
verification record and [examples/madar/README.md](examples/madar/README.md)
for the ten-section example.
