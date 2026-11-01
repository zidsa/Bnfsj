# Bnfsj

A product landing page theme for [Zid's Vitrin platform](https://zid.sa). Each page
sells one product at `/l/<slug>` with its own sections, colors, and content.

**Jinja2** | **esbuild** | **18 sections** | **Arabic + English (RTL-first)**

## Quick Start

Requires Python 3.11+ and Node 20+.

```sh
python3 -m venv .venv && source .venv/bin/activate
python -m pip install 'Jinja2>=3.1,<4' 'pytest>=8,<10'
npm ci --ignore-scripts

python -m pytest tests -q && npm test
```

| Command                                           | Description                                               |
| ------------------------------------------------- | --------------------------------------------------------- |
| `npm test`                                        | Rebuild the product bundle and run JS tests               |
| `python -m pytest tests -q`                       | Template, schema, and build tests                         |
| `python scripts/validate.py --language ar`        | Validate paths, schemas, assets, and render every section |
| `npm run build:runtime`                           | Rebuild `assets/bnfsj-product.js` from `src/`             |
| `python scripts/build.py --output dist/bnfsj.zip` | Package only the theme files into a ZIP                   |
| `python scripts/validate.py dist/bnfsj.zip`       | Validate a built package                                  |

## Local Preview

```sh
python scripts/validate.py --language en --html-output dist/preview.html
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/dist/preview.html`. The preview uses sample data and
stubs platform features, so test the SDK, editor, and checkout on a dev store.

## Deploy

Install the [Vitrin CLI](https://docs.zid.sa/introduction-1379356m0) and register
this repo once:

```sh
npm install -g @zidsa/vitrin-cli
vitrin login
vitrin new bnfsj --landing --from-existing .
```

Then release:

```sh
npm run build:runtime                    # The CLI does not rebuild the bundle
vitrin push                              # Template and text changes
vitrin push --new-version --bump patch   # CSS, JS, or asset changes
vitrin presets create ./preset.json      # Once: default sections for new pages
vitrin preview <store-id>                # Temporary page using your first product
```

- `vitrin push` does not upload `preset.json`. Without a preset, new pages start
  with no sections.
- Landing pages are never activated. Merchants create pages from them instead.
- Login is handled by the CLI. This repo holds no API keys or secrets.
- Pushes to `master` deploy automatically. Bump `version` in `package.json` first.

## Project Structure

```text
layout.jinja               Page shell and CSS variables
layout.schema.json         Font, color, radius, width, and spacing settings
layout.json                Default values for those settings
templates/landing.jinja    The page: sections plus the purchase bar
sections/                  Each section is a .jinja and a .schema.json
components/                Product partials (gallery, options, actions, quantity)
assets/bnfsj.css           Shared styles
assets/bnfsj-sections.js   Carousels and countdowns
src/product/               Selection, quantity, gallery, cart, and bundle logic
assets/bnfsj-product.js    Generated from src/. Do not edit.
locale/ar/                 Arabic translations. English strings are the source text.
preset.json                Default sections for new pages
examples/madar/            A full ten-section page
scripts/                   Build, validate, and optional Twig comparison tools
```

## Common Tasks

### Add a section

Create `sections/my-section.jinja`:

```jinja
<section section-id="{{ sectionId }}" class="bnfsj-section">
  <div class="bnfsj-container">{{ settings.title }}</div>
</section>
```

Create `sections/my-section.schema.json` next to it:

```json
{
  "section_id": "uuid",
  "template": "sections/my-section.jinja",
  "name": { "ar": "قسمي", "en": "My section" },
  "icon": "fal fa-sparkles",
  "display": true,
  "settings": [
    { "id": "title", "type": "text", "label": { "ar": "العنوان", "en": "Title" } }
  ]
}
```

Add it to `preset.json` under both `ar` and `en` to show it on new pages. See
[Schema files](https://docs.zid.sa/schema-files-1702180m0) for setting types.

### Change the design

1. Add the setting to `layout.schema.json`. A `primary` setting in the `theme` group
   becomes `settings.theme_primary`.
2. Map it to a CSS variable in `layout.jinja`, such as `--bnfsj-primary`.
3. Use the variable in `assets/bnfsj.css`.

Keep styles in the shared CSS. Avoid selectors tied to one section ID.

### Change product behavior

Edit `src/product/`, then run `npm run build:runtime`. Release it with
`--new-version`, because an in-place push can pair new templates with a cached old
bundle.

Keep the IDs, classes, and data attributes in `components/`. The bundle and the
Vitrin SDK read them. A page supports one product section.

### Translate text

Wrap the text in `{{ _('Text') }}`, then add the Arabic translation to
`locale/ar/LC_MESSAGES/messages.po`.

## Notes

- Product data (name, price, stock, variants, images) comes from the selected
  catalog product. Nothing is hardcoded per store.
- `dynamic_bundle` products keep the purchase buttons locked until the bundle kit
  reports a complete selection.

## Resources

- [Theme development](https://docs.zid.sa/theme-development)
- [Theme architecture](https://docs.zid.sa/architecture-1379322m0)
- [Templates](https://docs.zid.sa/overview-1379323m0)
- [Schema files](https://docs.zid.sa/schema-files-1702180m0)
- [Vitrin CLI](https://docs.zid.sa/introduction-1379356m0)
- [CLI commands](https://docs.zid.sa/cli-commands-1390556m0)
- [Growth theme](https://github.com/zidsa/growth-theme)
- [Madar example](examples/madar/README.md)
