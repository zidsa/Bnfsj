# Madar: ten-section example

Madar is an optional design example for Bnfsj. Its ten sections are header,
announcement, product, design facts, color introduction, gallery, design
details, payment methods, social links, and copyright. Arabic and English
content live in the same configuration with stable section IDs.

`settings.json` contains the settings array for `templates/landing.jinja` and
`layout.jinja`. All reusable layout and interaction code lives in the theme.
Shared `assets/bnfsj.css` styles newly created or reordered sections without
special section-ID selectors.

The example selects the [Zid palette](https://brand.zid.sa/color):
Royal `#3C1C54`, Dark `#1F0433`, White `#FFFFFF`, Neutral `#F5F4F6`, and Silver
`#E8E4EB`. Product images keep their original colors. The gallery uses the
bundled Madar front images; the four feature icons are inline SVG image URLs.

Use the example as a reference when composing a page in the merchant editor.
Choose your own catalog product, replace the sample copy, and upload your own
marketing images. Each page has independent settings; no particular store,
installation, or settings record is required by the theme code.

Image paths under `/examples/madar/images/` are for the local preview. Before
applying this settings array to a real page, replace them with image URLs from
that store's media library. The example JSON and images are not in the theme ZIP.
The sample product uses synthetic IDs and is never uploaded to a catalog.

To validate this configuration locally from the repository root:

```sh
python3 - <<'PY'
import json
from pathlib import Path
settings = json.loads(Path('examples/madar/settings.json').read_text())
Path('dist').mkdir(exist_ok=True)
Path('dist/madar-preset.json').write_text(json.dumps({'presets': settings}))
PY
python3 scripts/validate.py --preset dist/madar-preset.json --language ar --html-output dist/madar-ar.html
python3 scripts/validate.py --preset dist/madar-preset.json --language en --html-output dist/madar-en.html
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/dist/madar-en.html` or
`http://127.0.0.1:8000/dist/madar-ar.html`. The layout renders without access to
the demonstration store or its image storage. The preview stubs platform
behavior; use Vitrin to test actual product selection and checkout.
