# Bnfsj

A reusable product landing-page theme for [Zid's Vitrin platform](https://zid.sa).
One theme, any product: each landing page gets its own sections, copy, and design
settings in the merchant editor.

**Jinja2** | **esbuild** | **Arabic + English (RTL-first)**

## Quick Start

Requires Python 3.11+ and Node 20+.

```sh
python3 -m venv .venv && source .venv/bin/activate
python -m pip install 'Jinja2>=3.1,<4' 'pytest>=8,<10'
npm ci --ignore-scripts

python -m pytest tests -q && npm test
python scripts/build.py --output dist/bnfsj.zip --manifest dist/assets-manifest.json
```

Upload `dist/bnfsj.zip` through Vitrin's theme workflow.

## Commands

| Command | Description |
| --- | --- |
| `npm test` | Build the product runtime bundle and run the JS tests |
| `python -m pytest tests -q` | Template, schema, and build tests |
| `python scripts/validate.py --language ar\|en` | Validate paths, schemas, assets, and render every section |
| `python scripts/validate.py dist/bnfsj.zip` | Validate a built package |
| `python scripts/build.py --output dist/bnfsj.zip` | Build the deterministic theme ZIP |

## Local Preview

```sh
python scripts/validate.py --language en --html-output dist/preview.html
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/dist/preview.html`. The preview uses sample data
(`tests/fixtures/madar.json`) and stubbed platform partials, so checkout, SDK
calls, and editor persistence still need testing on Vitrin.

## Project Structure

```
layout.jinja / layout.schema.json   Page shell and global design settings (fonts, colors, spacing)
templates/landing.jinja             Landing page: composes sections + purchase bar
sections/                           18 merchant-editable sections (*.jinja + *.schema.json)
components/                         Product partials (gallery, options, actions, quantity, ...)
src/product/                        Product runtime ES modules, bundled to assets/bnfsj-product.js
assets/bnfsj.css                    Shared design layer; schema colors become --bnfsj-* variables
assets/bnfsj-sections.js            Carousels and countdowns, safe to re-initialize in the editor
locale/ar/                          Arabic translations (English strings are the source text)
preset.json                         Default six-section starter layout
examples/madar/                     Ten-section example configuration (see its README)
scripts/                            build, validate, and optional Twig comparison tools
```

## Notes

- Product data (name, price, stock, variants, images) comes from the selected
  catalog product; nothing is hardcoded per store.
- Keep one product section per page. Marketing sections can be reordered,
  hidden, or repeated.
- `dynamic_bundle` products keep the purchase buttons locked until the bundle kit
  reports a complete selection. Ship runtime changes as a new theme version, since
  an in-place push can pair new templates with a cached old `bnfsj-product.js`.
