# Madar: ten-section example

Madar is an example page configuration for Bnfsj. Its ten sections are header,
announcement, product, design facts, color introduction, gallery, design
details, payment methods, social links, and copyright. Arabic and English
content live in the same profile with stable section IDs.

`settings.json` is the native bulk-settings array for `templates/landing.jinja`
and `layout.jinja`. It contains content and theme settings; all reusable layout
and interaction code lives in the theme. The former Madar-only `brand.css` has
been replaced by shared `assets/bnfsj.css`, so newly created or reordered sections
receive the same design without special section-ID selectors.

The profile selects the official [Zid palette](https://brand.zid.sa/color):
Royal `#3C1C54`, Dark `#1F0433`, White `#FFFFFF`, Neutral `#F5F4F6`, and Silver
`#E8E4EB`. Product images keep their original colors. The gallery uses the
existing Madar front images; the four feature icons are inline SVG image URLs.

Apply the example to a page through the merchant editor. Each page has its own
configuration; no particular store, installation, or settings record is required
by the theme code.

To validate this configuration locally from the repository root:

```sh
python3 - <<'PY'
import json
from pathlib import Path
settings = json.loads(Path('examples/madar/settings.json').read_text())
Path('/tmp/madar-preset.json').write_text(json.dumps({'presets': settings}))
PY
python3 scripts/validate.py --preset /tmp/madar-preset.json --language ar
python3 scripts/validate.py --preset /tmp/madar-preset.json --language en
```

The initial ten-section profile was published and visually checked on
2026-09-10 at 390px and 1440px widths in both languages. Version 1.1.1 moves that
appearance into the reusable theme. See the repository QA record for release
verification and the limits of local platform stubs.
