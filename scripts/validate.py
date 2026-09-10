#!/usr/bin/env python3
"""Validate a bnfsj native Jinja source tree or built zip locally."""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any

try:
    from jinja2 import ChoiceLoader, DictLoader, Environment, FunctionLoader, StrictUndefined, TemplateError
except ImportError:  # pragma: no cover - the CLI reports this cleanly
    ChoiceLoader = DictLoader = Environment = FunctionLoader = StrictUndefined = TemplateError = None

MAX_PACKAGE_BYTES = 50 * 1024 * 1024
MAX_ASSET_BYTES = 2 * 1024 * 1024
ALLOWED_DIRECTORIES = {"assets", "components", "layouts", "locale", "sections", "templates"}
REQUIRED_TEMPLATES = {"layout.jinja", "templates/landing.jinja"}
DEFAULT_FIXTURE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "madar.json"
SETTING_TYPES = {"text", "textarea", "richtext", "number", "color", "url", "image", "video", "checkbox", "checkboxes", "radio", "range", "select", "product", "products", "category", "category_products", "snippet", "list", "fieldset"}


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    rendered: list[str] = field(default_factory=list)
    assets: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def _read_package(path: Path, report: Report) -> dict[str, bytes]:
    if path.is_dir():
        files: dict[str, bytes] = {}
        for filename in ("layout.jinja", "layout.json", "layout.schema.json"):
            item = path / filename
            if item.is_file():
                files[filename] = item.read_bytes()
        for item in sorted(p for p in path.rglob("*") if p.is_file()):
            rel = item.relative_to(path).as_posix()
            # A checkout also contains VCS metadata, scripts, and test files;
            # only archive roots participate in package validation.
            if PurePosixPath(rel).parts and PurePosixPath(rel).parts[0] in ALLOWED_DIRECTORIES:
                files[rel] = item.read_bytes()
        # A source checkout does not need generated entry templates checked in.
        # Validate the exact in-memory package that build.py would emit.
        if not REQUIRED_TEMPLATES.issubset(files):
            try:
                from .build import _read_files
            except ImportError:  # direct `python scripts/validate.py`
                import sys
                sys.path.insert(0, str(path))
                from scripts.build import _read_files
            try:
                files = _read_files(path)
            except (OSError, ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                report.errors.append(f"cannot assemble source package: {exc}")
        return files
    try:
        with zipfile.ZipFile(path) as archive:
            bad = archive.testzip()
            if bad:
                report.errors.append(f"archive CRC check failed: {bad}")
            names = archive.namelist()
            if len(names) != len(set(names)):
                report.errors.append("archive contains duplicate paths")
            return {name: archive.read(name) for name in names if not name.endswith("/")}
    except (OSError, zipfile.BadZipFile) as exc:
        report.errors.append(f"cannot read package: {exc}")
        return {}


def _path_checks(files: dict[str, bytes], package: Path, report: Report) -> None:
    total = sum(len(value) for value in files.values())
    if total > MAX_PACKAGE_BYTES:
        report.errors.append(f"uncompressed package is {total} bytes; limit is {MAX_PACKAGE_BYTES}")
    if package.is_file() and package.stat().st_size > MAX_PACKAGE_BYTES:
        report.errors.append(f"archive is {package.stat().st_size} bytes; limit is {MAX_PACKAGE_BYTES}")
    for name, content in files.items():
        path = PurePosixPath(name)
        if not name or name.startswith("/") or "\\" in name or ".." in path.parts:
            report.errors.append(f"unsafe archive path: {name!r}")
            continue
        if len(path.parts) > 1 and path.parts[0] not in ALLOWED_DIRECTORIES:
            report.errors.append(f"unsupported archive root: {name}")
        if len(path.parts) == 1 and name not in {"layout.jinja", "layout.json", "layout.schema.json"}:
            report.errors.append(f"unsupported package root file: {name}")
        if name.startswith("assets/"):
            report.assets.append(name)
            if len(content) > MAX_ASSET_BYTES:
                report.errors.append(f"asset {name} is {len(content)} bytes; limit is {MAX_ASSET_BYTES}")
    missing = REQUIRED_TEMPLATES - files.keys()
    report.errors.extend(f"missing required template: {path}" for path in sorted(missing))


def _labels(value: Any, where: str, report: Report) -> bool:
    if not isinstance(value, dict) or not all(isinstance(value.get(k), str) for k in ("ar", "en")):
        report.errors.append(f"{where}: expected ar/en string labels")
        return False
    return True


def _validate_setting(setting: Any, where: str, report: Report, seen: set[str]) -> None:
    if not isinstance(setting, dict):
        report.errors.append(f"{where}: setting must be an object")
        return
    setting_id = setting.get("id")
    setting_type = setting.get("type")
    if not isinstance(setting_id, str) or not setting_id:
        report.errors.append(f"{where}: setting id is required")
    elif setting_id in seen:
        report.errors.append(f"{where}: duplicate setting id {setting_id!r}")
    else:
        seen.add(setting_id)
    if setting_type not in SETTING_TYPES:
        report.errors.append(f"{where}: unsupported setting type {setting_type!r}")
    _labels(setting.get("label"), f"{where}.label", report)
    if setting_type in {"list", "fieldset"}:
        nested = setting.get("settings")
        if not isinstance(nested, list) or not nested:
            report.errors.append(f"{where}: {setting_type} requires non-empty settings")
        else:
            nested_seen: set[str] = set()
            for index, child in enumerate(nested):
                _validate_setting(child, f"{where}.settings[{index}]", report, nested_seen)
    if setting_type == "range":
        if not isinstance(setting.get("min"), (int, float)) or not isinstance(setting.get("max"), (int, float)):
            report.errors.append(f"{where}: range requires numeric min/max")
        elif setting["min"] > setting["max"]:
            report.errors.append(f"{where}: range min exceeds max")
    if setting_type in {"radio", "select"} and not isinstance(setting.get("options"), list):
        report.errors.append(f"{where}: {setting_type} requires options")


def _validate_schemas(files: dict[str, bytes], report: Report) -> dict[str, dict[str, Any]]:
    schemas: dict[str, dict[str, Any]] = {}
    for name, content in sorted(files.items()):
        if not name.endswith(".schema.json"):
            continue
        try:
            schema = json.loads(content.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            report.errors.append(f"{name}: invalid UTF-8/JSON ({exc})")
            continue
        if not isinstance(schema, dict):
            report.errors.append(f"{name}: schema must be an object")
            continue
        schemas[name] = schema
        if "display" in schema and not isinstance(schema["display"], bool):
            report.errors.append(f"{name}.display: expected a boolean")
        if name.startswith("sections/"):
            _labels(schema.get("name"), f"{name}.name", report)
            expected = name.removesuffix(".schema.json") + ".jinja"
            if schema.get("template") != expected:
                report.errors.append(f"{name}: template must be {expected}")
            settings = schema.get("settings")
            if not isinstance(settings, list) or not settings:
                report.errors.append(f"{name}: sections require a non-empty settings list")
            else:
                seen: set[str] = set()
                for index, setting in enumerate(settings):
                    _validate_setting(setting, f"{name}.settings[{index}]", report, seen)
        groups = schema.get("groups")
        if groups is not None:
            if not isinstance(groups, list) or not groups:
                report.errors.append(f"{name}.groups: expected a non-empty list")
            else:
                for group_index, group in enumerate(groups):
                    where = f"{name}.groups[{group_index}]"
                    if not isinstance(group, dict):
                        report.errors.append(f"{where}: group must be an object")
                        continue
                    group_id = group.get("id")
                    if not isinstance(group_id, str) or not group_id:
                        report.errors.append(f"{where}.id: group id is required")
                    _labels(group.get("name"), f"{where}.name", report)
                    group_settings = group.get("settings")
                    if not isinstance(group_settings, list) or not group_settings:
                        report.errors.append(f"{where}.settings: expected a non-empty list")
                        continue
                    seen: set[str] = set()
                    for setting_index, setting in enumerate(group_settings):
                        _validate_setting(setting, f"{where}.settings[{setting_index}]", report, seen)
    for name in sorted(n for n in files if n.startswith("sections/") and n.endswith(".jinja")):
        schema_name = f"{name[:-6]}.schema.json"
        if schema_name not in schemas:
            report.errors.append(f"{name}: missing adjacent schema {schema_name}")
    return schemas


_ASSET_FILTER = re.compile(r"(['\"])([^'\"]+)\1\s*\|\s*asset_url")
_ASSET_FUNCTION = re.compile(r"\bassetUrl\(\s*(['\"])([^'\"]+)\1")
_CSS_URL = re.compile(r"url\(\s*(['\"]?)(?!https?://|data:)([^'\")]+)\1\s*\)", re.I)
_JS_IMPORT_FROM = re.compile(r"\b(?:from|import\s*\(|require\s*\()\s*(['\"])(\.[^'\"]+)\1")
_JS_IMPORT_SIDE_EFFECT = re.compile(r"\bimport\s*(['\"])(\.[^'\"]+)\1")
# Vitrin exposes Jinja's standard tests; it does not register Twig's
# `empty` test.  Keep this check explicit so local validation cannot hide a
# storefront compile failure behind a compatibility shim.
_UNSUPPORTED_EMPTY_TEST = re.compile(r"\bis\s+(?:not\s+)?empty\b")


def _validate_asset_refs(files: dict[str, bytes], report: Report) -> None:
    assets = {name.removeprefix("assets/") for name in files if name.startswith("assets/")}
    missing_vendor: set[tuple[str, str]] = set()
    for name, raw in files.items():
        if not (name.endswith((".jinja", ".css", ".js", ".html"))):
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        refs = [match[1] for match in _ASSET_FILTER.findall(text)] + [match[1] for match in _ASSET_FUNCTION.findall(text)]
        for raw_ref in refs:
            ref = raw_ref.split("?", 1)[0].split("#", 1)[0]
            if ref.startswith(("http://", "https://", "data:")):
                continue
            if ref not in assets:
                report.errors.append(f"{name}: referenced asset is missing: {ref}")
        if name.startswith("assets/") and name.endswith(".css"):
            parent = PurePosixPath(name).parent
            for _quote, raw_ref in _CSS_URL.findall(text):
                ref = raw_ref.strip().split("?", 1)[0].split("#", 1)[0]
                if not ref:
                    continue
                candidate = (parent / ref).as_posix()
                if candidate not in files and ref not in {"#", "none"}:
                    if name in {"assets/jquery-ui.min.css", "assets/jquery-ui.theme.min.css"} and ref.startswith("images/ui-icons_"):
                        missing_vendor.add((name, ref))
                    else:
                        report.errors.append(f"{name}: local CSS asset is missing: {ref}")
        # Only authored ES-module trees are checked. Bundled vendor UMD files
        # commonly contain AMD require("./item") names that refer to modules
        # embedded in the bundle rather than archive paths.
        if name.startswith(("assets/js/", "assets/bnfsj-")) and name.endswith(".js"):
            imports = [match[1] for match in _JS_IMPORT_FROM.findall(text)]
            imports.extend(match[1] for match in _JS_IMPORT_SIDE_EFFECT.findall(text))
            parent = PurePosixPath(name).parent
            for raw_ref in imports:
                ref = raw_ref.split("?", 1)[0].split("#", 1)[0]
                candidate = posixpath.normpath((parent / ref).as_posix())
                if not candidate.startswith("assets/"):
                    report.errors.append(f"{name}: unsafe relative JS import path: {raw_ref}")
                    continue
                if candidate not in files:
                    report.errors.append(f"{name}: local JS import is missing: {raw_ref}")
    report.warnings.extend(f"{name}: optional vendor asset is missing: {ref}" for name, ref in sorted(missing_vendor))


def _fixture_for_schema(schema: dict[str, Any], language: str = "ar") -> dict[str, Any]:
    """Build safe render defaults using the schema's canonical setting keys.

    Layout schemas use groups to namespace settings in the runtime (``font``
    + ``family`` becomes ``font_family``).  Keeping that namespace here makes
    the offline context match the editor/exported preset instead of silently
    dropping grouped settings.
    """

    def localize(value: Any) -> Any:
        if isinstance(value, dict) and {"ar", "en"}.issubset(value):
            return value[language]
        return value

    def value(setting: dict[str, Any]) -> Any:
        kind = setting.get("type")
        if kind in {"list", "fieldset"}:
            child = {
                item["id"]: value(item)
                for item in setting.get("settings", [])
                if isinstance(item, dict) and item.get("id")
            }
            return [child]
        if "default" in setting:
            return localize(setting["default"])
        return {"checkbox": True, "number": 1, "range": 1}.get(kind, "Sample")

    result: dict[str, Any] = {}
    settings = schema.get("settings", [])
    if isinstance(settings, list):
        result.update({item["id"]: value(item) for item in settings if isinstance(item, dict) and item.get("id")})
    groups = schema.get("groups", [])
    if isinstance(groups, list):
        for group in groups:
            if not isinstance(group, dict) or not isinstance(group.get("settings"), list):
                continue
            group_id = group.get("id")
            for item in group["settings"]:
                if isinstance(item, dict) and item.get("id"):
                    key = f"{group_id}_{item['id']}" if group_id else item["id"]
                    result[key] = value(item)
    return result


class _Object(dict):
    def __getattr__(self, key: str) -> Any:
        return self.get(key, _Object())


def _wrap(value: Any) -> Any:
    """Wrap fixture dictionaries so templates can use native dotted access."""
    if isinstance(value, dict):
        return _Object({key: _wrap(item) for key, item in value.items()})
    if isinstance(value, list):
        return [_wrap(item) for item in value]
    return value


def _product_fixture(fixture_path: Path | None, report: Report) -> _Object:
    """Load a captured product response, adding the fields Vitrin derives."""
    raw: dict[str, Any] = {}
    if fixture_path and fixture_path.is_file():
        try:
            loaded = json.loads(fixture_path.read_text(encoding="utf-8"))
            if not isinstance(loaded, dict):
                raise ValueError("fixture root must be a JSON object")
            raw = loaded
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            report.errors.append(f"product fixture cannot be loaded: {exc}")
    if not raw:
        raw = {
            "id": "product",
            "name": "Sample",
            "images": [],
            "options": [],
            "variants": [],
            "has_variants": False,
            "has_fields": False,
            "selected_product": {"id": "variant", "images": [], "formatted_price": "1", "formatted_sale_price": "", "in_stock": False, "attributes": []},
        }
    variants = raw.get("variants")
    if isinstance(variants, list) and variants:
        selected = dict(variants[0]) if isinstance(variants[0], dict) else variants[0]
        raw["selected_product"] = selected
        raw["has_variants"] = True
    elif "selected_product" not in raw:
        raw["selected_product"] = raw
    raw.setdefault("has_variants", bool(variants))
    custom_fields = raw.get("custom_user_input_fields") or raw.get("custom_option_fields")
    raw.setdefault("has_fields", bool(custom_fields))
    selected = raw.get("selected_product")
    if isinstance(selected, dict):
        if "in_stock" not in selected:
            quantity = selected.get("quantity")
            selected["in_stock"] = bool(selected.get("is_infinite") or (isinstance(quantity, (int, float)) and quantity > 0))
        selected.setdefault("attributes", [])
        selected.setdefault("images", raw.get("images", []))
    return _wrap(raw)


def _render_templates(
    files: dict[str, bytes],
    schemas: dict[str, dict[str, Any]],
    report: Report,
    fixture_path: Path | None = DEFAULT_FIXTURE,
    html_output: Path | None = None,
    preset_path: Path | None = None,
    language: str = "ar",
) -> None:
    if Environment is None:
        report.errors.append("Jinja2 is required for template validation (pip install Jinja2)")
        return
    templates = {}
    for name, content in files.items():
        if name.endswith(".jinja"):
            try:
                templates[name] = content.decode("utf-8")
            except UnicodeDecodeError as exc:
                report.errors.append(f"{name}: invalid UTF-8 ({exc})")
    # Platform-only tags are represented by harmless placeholders locally.  The
    # real Vitrin environment supplies their extension implementations.
    for name, source in list(templates.items()):
        if _UNSUPPORTED_EMPTY_TEST.search(source):
            report.errors.append(f"{name}: unsupported Jinja test 'empty'; use truthiness or length")
        # A callback is used instead of a replacement backreference.  Comments
        # keep the platform boundary visible without adding rendered height to
        # the offline visual comparison.
        source = re.sub(
            r"\{%\s*(vitrin_head|vitrin_body)\s*%\}",
            lambda match: "<!-- platform: " + match.group(1) + " -->",
            source,
        )
        source = re.sub(r"\{%\s*template_components\s*%\}", "{{ template_components_html | safe }}", source)
        templates[name] = source
    platform_includes: set[str] = set()

    def load_platform(name: str) -> str | None:
        if name.startswith("vitrin:"):
            platform_includes.add(name)
            # These partials are supplied by the deployed Vitrin runtime.  An
            # empty local body keeps source compilation deterministic while the
            # warning below makes the boundary explicit in the report.
            return ""
        return None

    fallback = FunctionLoader(load_platform)
    env = Environment(loader=ChoiceLoader([DictLoader(templates), fallback]), undefined=StrictUndefined, autoescape=False)
    # Keep only the local equivalents of helpers that Vitrin exposes.  Legacy
    # Twig names (assetUrl/json_encode/strReplace/url_for) are deliberately not
    # registered: if authored source still uses one, StrictUndefined catches
    # it during this validation pass instead of reporting a false success.
    env.filters.update({"asset_url": lambda name: f"/assets/{name}", "safe": lambda value: value, "tojson": lambda value: json.dumps(value, ensure_ascii=False)})
    env.globals.update({"image_url": lambda value, **kwargs: value or "", "safeget": lambda obj, key, default="": (obj.get(key, default) if isinstance(obj, dict) else default), "_": lambda value, *args: value})
    layout_settings = _fixture_for_schema(schemas.get("layout.schema.json", {}))
    product = _product_fixture(fixture_path, report)
    direction = "rtl" if language == "ar" else "ltr"
    fixture_base = _Object(session=_Object(lang=language, locale=_Object(language=_Object(direction=direction))), store=_Object(name="bnfsj", logo="", colors=_Object(primary="#780001", text_of_primary_bg="#fff"), settings=_Object(contact=_Object())), locals=_Object(), product=product, components=_Object(), customer=_Object(mobile="9660000000"), sectionId="section-1", header_settings=_Object(), user_custom_css="")
    component_html = ""
    if preset_path and preset_path.is_file():
        try:
            preset = json.loads(preset_path.read_text(encoding="utf-8"))
            preset_items = preset.get("presets")
            if not isinstance(preset_items, list):
                raise ValueError("preset.presets must be a list")

            def preset_for(path: str) -> dict[str, Any] | None:
                return next(
                    (item for item in preset_items if isinstance(item, dict) and item.get("path") == path),
                    None,
                )

            landing_preset = preset_for("templates/landing.jinja")
            layout_preset = preset_for("layout.jinja")
            if landing_preset is None:
                raise ValueError("preset has no templates/landing.jinja entry")
            components_by_language = landing_preset.get("settings", {}).get("components", {})
            components = components_by_language.get(language, []) if isinstance(components_by_language, dict) else []
            if not isinstance(components, list):
                raise ValueError(f"landing components for {language} must be a list")
            if layout_preset is not None and isinstance(layout_preset.get("settings"), dict):
                configured = layout_preset["settings"]
                localized = configured.get(language)
                if isinstance(localized, dict):
                    layout_settings.update(localized)
                elif not any(key in configured for key in ("ar", "en")):
                    layout_settings.update(configured)
            fixture_base["components"] = _wrap(components)
            rendered_components: list[str] = []
            for component in components:
                component_name = component.get("template")
                if not isinstance(component_name, str) or component_name not in templates:
                    report.errors.append(f"preset references missing template: {component_name}")
                    continue
                schema = schemas.get(f"{component_name[:-6]}.schema.json", {})
                if component.get("display") is False or schema.get("display") is False:
                    continue
                component_template = env.get_template(component_name)
                component_settings = component.get("settings", {})
                if not isinstance(component_settings, dict):
                    report.errors.append(f"preset settings must be an object: {component_name}")
                    continue
                component_context = dict(fixture_base)
                component_context.update({"settings": _Object(component_settings), "sectionId": component.get("section_id", "section-1"), "template_components_html": ""})
                try:
                    rendered_components.append(component_template.render(**component_context))
                    report.rendered.append(component_name)
                except TemplateError as exc:
                    report.errors.append(f"{component_name}: Jinja render failed: {exc}")
                except Exception as exc:
                    report.errors.append(f"{component_name}: render fixture failed: {type(exc).__name__}: {exc}")
            component_html = "\n".join(rendered_components)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
            report.errors.append(f"preset cannot be loaded for render validation: {exc}")
    landing_html: str | None = None
    # Compile every authored template so syntax and include errors are still
    # reported, but render sections through the landing entrypoint above. A
    # standalone section does not have the platform context it receives in a
    # real page and can produce misleading StrictUndefined failures.
    for name in sorted(templates):
        try:
            template = env.get_template(name)
            if name == "templates/landing.jinja":
                rendered = template.render(**fixture_base, settings=_Object(layout_settings), template_components_html=component_html)
                landing_html = rendered
                report.rendered.append(name)
        except TemplateError as exc:
            report.errors.append(f"{name}: Jinja render failed: {exc}")
        except Exception as exc:
            report.errors.append(f"{name}: render fixture failed: {type(exc).__name__}: {exc}")
    if html_output and landing_html is not None:
        html_output.parent.mkdir(parents=True, exist_ok=True)
        html_output.write_text(landing_html, encoding="utf-8")
    for name in sorted(platform_includes):
        report.warnings.append(f"render used deployed Vitrin partial stub: {name}")


def validate(path: Path, fixture_path: Path | None = DEFAULT_FIXTURE, html_output: Path | None = None, preset_path: Path | None = None, language: str = "ar") -> Report:
    if language not in {"ar", "en"}:
        raise ValueError("language must be 'ar' or 'en'")
    report = Report()
    files = _read_package(path, report)
    _path_checks(files, path, report)
    schemas = _validate_schemas(files, report)
    _validate_asset_refs(files, report)
    if preset_path is None and path.is_dir():
        candidate = path / "preset.json"
        preset_path = candidate if candidate.is_file() else None
    _render_templates(files, schemas, report, fixture_path, html_output, preset_path, language)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", nargs="?", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE, help="captured product JSON used for render validation")
    parser.add_argument("--html-output", type=Path, default=None, help="write rendered landing HTML for local visual inspection")
    parser.add_argument("--preset", type=Path, default=None, help="preset JSON used to expand local template_components")
    parser.add_argument("--language", choices=("ar", "en"), default="ar", help="locale used for render validation")
    parser.add_argument("--no-fixture", action="store_true", help="use the small synthetic fallback fixture")
    args = parser.parse_args()
    report = validate(args.package, None if args.no_fixture else args.fixture, args.html_output, args.preset, args.language)
    print(json.dumps({"ok": report.ok, "errors": report.errors, "warnings": report.warnings, "rendered": report.rendered, "assets": report.assets}, ensure_ascii=False, indent=2))
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
