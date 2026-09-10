#!/usr/bin/env python3
"""Compare the native package with the checked-in Twig sample locally.

This is deliberately offline.  It checks the byte-for-byte asset migration and
section inventory, then renders both templates with the sample product
fixture so the resulting files can be opened side by side.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

try:
    from .build import _read_files
    from .validate import validate
except ImportError:  # direct `python scripts/compare.py`
    from build import _read_files
    from validate import validate


PHP_RENDERER = r'''<?php
require getenv('BNFSJ_TWIG_AUTOLOAD');
$base = getenv('BNFSJ_BASELINE');
$tmp = getenv('BNFSJ_TMP');
$fixture = json_decode(file_get_contents(getenv('BNFSJ_FIXTURE')), true);
$fixture['selected_product'] = $fixture['variants'][0];
$fixture['selected_product']['out_of_stock'] = false;
$fixture['has_variants'] = true;
$fixture['has_custom_input_fields'] = false;
$loader = new Twig\Loader\FilesystemLoader([$tmp.'/templates', $tmp.'/modules']);
$twig = new Twig\Environment($loader, ['autoescape' => false]);
$twig->addFunction(new Twig\TwigFunction('assetUrl', fn($name) => '/assets/'.$name));
$twig->addFunction(new Twig\TwigFunction('imageUrl', fn($name) => $name ?? ''));
$twig->addFunction(new Twig\TwigFunction('strReplace', fn($old, $new, $value) => str_replace($old, $new, (string)$value)));
$preset = json_decode(file_get_contents(getenv('BNFSJ_PRESET')), true);
$components = $preset['presets'][0]['settings']['components']['ar'];
$locals = json_decode(file_get_contents($base.'/locals/ar.json'), true);
$parts = [];
$render_errors = [];
$basevars = [
  'asset_url' => '/assets/',
  'session' => ['lang' => ['code' => 'ar']],
  'store' => ['name' => 'bnfsj', 'logo' => '', 'log' => '', 'editing_mode' => false,
    'is_low_stock_label_enabled' => false, 'colors' => ['primary' => '#780001', 'text_of_primary_bg' => '#fff'],
    'social_media' => ['items' => []], 'payment_methods' => [],
    'settings' => ['contact' => [], 'checkout' => ['payment_methods' => []]]],
  'locals' => $locals, 'product' => $fixture, 'customer' => ['mobile' => '9660000000'],
  'header_settings' => [], 'user_custom_css' => '', 'zidapi_script' => '', 'product_view_scripts' => '',
  'settings' => ['fonts_name' => 'IBM+Plex+Sans+Arabic', 'general_settings_css' => ''],
];
foreach ($components as $component) {
  $stem = pathinfo($component['template'], PATHINFO_FILENAME);
  $source = $base.'/modules/'.$stem.'.twig';
  if (!is_file($source)) continue;
  $renderable = preg_replace('/\{% schema %\}.*?\{% endschema %\}/s', '', file_get_contents($source));
  $renderable = preg_replace('/\{% include [^%]+%\}/', '', $renderable);
  file_put_contents($tmp.'/modules/'.$stem.'.twig', $renderable);
  try {
    $parts[] = $twig->render($stem.'.twig', array_replace($basevars, ['settings' => $component['settings'], 'sectionId' => $component['section_id']]));
  } catch (Throwable $error) {
    $render_errors[] = $stem.': '.$error->getMessage();
  }
}
if ($render_errors) {
  fwrite(STDERR, implode("\n", $render_errors)."\n"); exit(2);
}
$landing = preg_replace('/\{% include [^%]+%\}/', '', file_get_contents($base.'/templates/landing_page.twig'));
file_put_contents($tmp.'/templates/landing_page.twig', $landing);
try {
  echo $twig->render('landing_page.twig', array_replace($basevars, ['home_template_modules' => implode("\n", $parts)]));
} catch (Throwable $error) {
  fwrite(STDERR, $error->getMessage()."\n"); exit(1);
}
'''


def _hash_assets(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root / "assets").as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted((root / "assets").rglob("*"))
        if path.is_file()
    }


def _render_twig(baseline: Path, fixture: Path, preset: Path, output: Path, autoload: Path) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="bnfsj-twig-") as temp:
        temp_path = Path(temp)
        (temp_path / "templates").mkdir()
        (temp_path / "modules").mkdir()
        env = {
            **os.environ,
            "BNFSJ_BASELINE": str(baseline),
            "BNFSJ_FIXTURE": str(fixture),
            "BNFSJ_PRESET": str(preset),
            "BNFSJ_TMP": str(temp_path),
            "BNFSJ_TWIG_AUTOLOAD": str(autoload),
        }
        process = subprocess.run(["php"], input=PHP_RENDERER.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, check=False)
        if process.returncode:
            return {"ok": False, "error": process.stderr.decode("utf-8", "replace").strip()}
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(process.stdout)
        return {"ok": True, "bytes": len(process.stdout), "warnings": process.stderr.decode("utf-8", "replace").splitlines()}


def compare(native: Path, baseline: Path, fixture: Path, native_html: Path, twig_html: Path, autoload: Path) -> dict[str, Any]:
    native_files = _read_files(native)
    old_assets = _hash_assets(baseline)
    native_assets = {name.removeprefix("assets/"): hashlib.sha256(content).hexdigest() for name, content in native_files.items() if name.startswith("assets/")}
    old_sections = {path.stem for path in (baseline / "modules").glob("*.twig")}
    native_sections = {path.stem for path in (native / "sections").glob("*.jinja")}
    report = validate(native, fixture, native_html)
    twig = _render_twig(baseline, fixture, native / "preset.json", twig_html, autoload)
    return {
        "native_valid": report.ok,
        "native_errors": report.errors,
        "native_warnings": report.warnings,
        "asset_sha256_equal": all(native_assets.get(name) == digest for name, digest in old_assets.items()),
        "asset_missing": sorted(set(old_assets) - set(native_assets)),
        "asset_extra": sorted(set(native_assets) - set(old_assets)),
        "section_stems_equal": old_sections == native_sections,
        "sections_missing": sorted(old_sections - native_sections),
        "sections_extra": sorted(native_sections - old_sections),
        "native_html": str(native_html),
        "twig_html": str(twig_html),
        "twig_render": twig,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--baseline", type=Path, required=True, help="original Twig sample directory")
    parser.add_argument("--fixture", type=Path, default=Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "madar.json")
    parser.add_argument(
        "--twig-autoload",
        type=Path,
        default=None,
        help="Twig Composer autoload.php path (or set BNFSJ_TWIG_AUTOLOAD)",
    )
    parser.add_argument("--native-html", type=Path, default=Path("/tmp/bnfsj-native.html"))
    parser.add_argument("--twig-html", type=Path, default=Path("/tmp/bnfsj-twig.html"))
    args = parser.parse_args()
    autoload_value = args.twig_autoload or os.environ.get("BNFSJ_TWIG_AUTOLOAD")
    if not autoload_value:
        parser.error("provide --twig-autoload or set BNFSJ_TWIG_AUTOLOAD")
    autoload = Path(autoload_value)
    if not args.baseline.is_dir():
        parser.error("--baseline must be an existing Twig sample directory")
    if not autoload.is_file():
        parser.error("Twig autoload.php must be an existing file")
    result = compare(args.native, args.baseline, args.fixture, args.native_html, args.twig_html, autoload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["native_valid"] and result["asset_sha256_equal"] and result["section_stems_equal"] and result["twig_render"]["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
