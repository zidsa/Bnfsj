from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

import pytest

from scripts.build import build
from scripts.validate import _fixture_for_schema, validate


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "madar.json"


def test_build_is_native_and_deterministic(tmp_path: Path) -> None:
    first = tmp_path / "one.zip"
    second = tmp_path / "two.zip"
    build(ROOT, first)
    build(ROOT, second)
    assert first.read_bytes() == second.read_bytes()
    with zipfile.ZipFile(first) as archive:
        names = set(archive.namelist())
        assert {"layout.jinja", "templates/landing.jinja"} <= names
        assert "template_components" in archive.read("templates/landing.jinja").decode()
        header = json.loads(archive.read("sections/header.schema.json"))
        assert isinstance(header["settings"], list)
        assert header["settings"]
        for name in names:
            assert archive.read(name) == (ROOT / name).read_bytes()


def test_built_package_validates_and_renders() -> None:
    report = validate(ROOT)
    assert report.ok, report.errors
    assert "templates/landing.jinja" in report.rendered
    assert "sections/product-section.jinja" in report.rendered
    assert report.assets


def test_render_uses_captured_product_and_preset(tmp_path: Path) -> None:
    html = tmp_path / "landing.html"
    report = validate(ROOT, FIXTURE, html)
    assert report.ok, report.errors
    rendered = html.read_text(encoding="utf-8")
    assert "Madar loop vase" in rendered
    assert "3222ce5b-e41a-4004-8ccd-fdcd802076cf.png" in rendered
    assert "section-id=\"3a16255e-2067-501f-99b6-1d6c22b790dd\"" in rendered
    assert "<!-- platform: vitrin_head -->" in rendered
    assert "<!-- platform: vitrin_body -->" in rendered
    assert "\x01" not in rendered


def test_validator_rejects_unsafe_paths_and_missing_assets(tmp_path: Path) -> None:
    package = tmp_path / "bad.zip"
    with zipfile.ZipFile(package, "w") as archive:
        archive.writestr("layout.jinja", "{% vitrin_head %}{% vitrin_body %}")
        archive.writestr("templates/landing.jinja", '{% extends "layout.jinja" %}{% block content %}{% template_components %}{% endblock %}')
        archive.writestr("sections/hero.jinja", "<img src={{ 'missing.png' | asset_url }}>")
        archive.writestr("sections/hero.schema.json", json.dumps({
            "name": {"ar": "Hero", "en": "Hero"},
            "template": "sections/hero.jinja",
            "settings": [{"id": "title", "type": "text", "label": {"ar": "عنوان", "en": "Title"}}],
        }))
        archive.writestr("../escape.txt", "bad")
    report = validate(package)
    assert not report.ok
    assert any("unsafe archive path" in error for error in report.errors)
    assert any("missing.png" in error for error in report.errors)


def test_build_requires_authored_entry_templates(tmp_path: Path) -> None:
    source = tmp_path / "source"
    (source / "sections").mkdir(parents=True)
    (source / "sections" / "hero.jinja").write_text("<h1>Hero</h1>", encoding="utf-8")
    with pytest.raises(ValueError, match="missing required authored template"):
        build(source, tmp_path / "theme.zip")


def test_validator_rejects_twig_empty_test(tmp_path: Path) -> None:
    package = tmp_path / "twig-test.zip"
    with zipfile.ZipFile(package, "w") as archive:
        archive.writestr("layout.jinja", "{% if value is not empty %}{{ value }}{% endif %}")
        archive.writestr(
            "templates/landing.jinja",
            '{% extends "layout.jinja" %}{% block content %}{% endblock %}',
        )
    report = validate(package)
    assert not report.ok
    assert any("unsupported Jinja test 'empty'" in error for error in report.errors)


def test_grouped_layout_defaults_are_namespaced_and_preserve_zero(tmp_path: Path) -> None:
    source = tmp_path / "theme"
    shutil.copytree(ROOT, source, ignore=shutil.ignore_patterns("node_modules", ".git", "dist", "__pycache__", ".pytest_cache"))

    schema = json.loads((source / "layout.schema.json").read_text(encoding="utf-8"))
    for group in schema["groups"]:
        for setting in group["settings"]:
            if group["id"] == "font" and setting["id"] == "family":
                setting["default"] = "Cairo"
            if group["id"] == "theme" and setting["id"] == "radius":
                setting["default"] = 0
            if group["id"] == "layout" and setting["id"] == "width":
                setting["default"] = 1000
    (source / "layout.schema.json").write_text(json.dumps(schema), encoding="utf-8")

    preset = json.loads((source / "preset.json").read_text(encoding="utf-8"))
    preset["presets"] = [item for item in preset["presets"] if item["path"] != "layout.jinja"]
    (source / "preset.json").write_text(json.dumps(preset), encoding="utf-8")

    defaults = _fixture_for_schema(schema, language="en")
    assert defaults["font_family"] == "Cairo"
    assert defaults["theme_radius"] == 0
    assert defaults["layout_width"] == 1000
    assert "family" not in defaults

    output = tmp_path / "layout.html"
    report = validate(source, FIXTURE, output, language="en")
    assert report.ok, report.errors
    rendered = output.read_text(encoding="utf-8")
    assert 'lang="en"' in rendered and 'dir="ltr"' in rendered
    assert "--bnfsj-radius: 0px" in rendered
    assert "--bnfsj-width: 1000px" in rendered
    assert "family=Cairo" in rendered or "Cairo" in rendered


def test_render_uses_selected_language_and_preserves_component_order(tmp_path: Path) -> None:
    source = tmp_path / "theme"
    shutil.copytree(ROOT, source, ignore=shutil.ignore_patterns("node_modules", ".git", "dist", "__pycache__", ".pytest_cache"))
    preset = json.loads((source / "preset.json").read_text(encoding="utf-8"))
    landing = next(item for item in preset["presets"] if item["path"] == "templates/landing.jinja")
    english = landing["settings"]["components"]["en"]
    english[:] = [
        {"section_id": "marketing-first", "template": "sections/text-section.jinja", "settings": {"description": "First marketing message"}},
        {"section_id": "marketing-second", "template": "sections/text-section.jinja", "settings": {"description": "Second marketing message"}},
        {"section_id": "hidden-marketing", "template": "sections/text-section.jinja", "display": False, "settings": {"description": "Should stay hidden"}},
    ]
    (source / "preset.json").write_text(json.dumps(preset), encoding="utf-8")

    output = tmp_path / "english.html"
    report = validate(source, FIXTURE, output, language="en")
    assert report.ok, report.errors
    rendered = output.read_text(encoding="utf-8")
    first = rendered.index("First marketing message")
    second = rendered.index("Second marketing message")
    assert first < second
    assert "Should stay hidden" not in rendered
    assert 'section-id="marketing-first"' in rendered
    assert 'section-id="marketing-second"' in rendered


def test_render_handles_multiple_sections_without_images(tmp_path: Path) -> None:
    source = tmp_path / "theme"
    shutil.copytree(ROOT, source, ignore=shutil.ignore_patterns("node_modules", ".git", "dist", "__pycache__", ".pytest_cache"))
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    fixture["images"] = []
    fixture["variants"][0]["images"] = []
    fixture_path = tmp_path / "no-images.json"
    fixture_path.write_text(json.dumps(fixture), encoding="utf-8")

    preset = json.loads((source / "preset.json").read_text(encoding="utf-8"))
    landing = next(item for item in preset["presets"] if item["path"] == "templates/landing.jinja")
    component = {"section_id": "marketing-extra", "template": "sections/text-section.jinja", "settings": {"description": "Extra marketing"}}
    landing["settings"]["components"]["ar"].insert(1, component)
    (source / "preset.json").write_text(json.dumps(preset), encoding="utf-8")

    output = tmp_path / "no-images.html"
    report = validate(source, fixture_path, output)
    assert report.ok, report.errors
    rendered = output.read_text(encoding="utf-8")
    assert 'section-id="marketing-extra"' in rendered
    assert "Madar loop vase" in rendered


def test_all_sections_render_through_landing_entrypoint_in_both_languages(tmp_path: Path) -> None:
    source = tmp_path / "theme"
    shutil.copytree(ROOT, source, ignore=shutil.ignore_patterns("node_modules", ".git", "dist", "__pycache__", ".pytest_cache"))
    preset = json.loads((source / "preset.json").read_text(encoding="utf-8"))
    sections = []
    for schema_path in sorted((source / "sections").glob("*.schema.json"), reverse=True):
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        template = schema["template"]
        settings = _fixture_for_schema(schema)
        if "hide" in settings:
            settings["hide"] = False
        # The partner renderer accepts these fallback labels even though the
        # editor schema only exposes image and URL for a partner row.
        if template == "sections/partners.jinja":
            settings["store_partners"][0].update(name="Sample partner", title="Sample partner")
        sections.append({
            "section_id": f"synthetic-{schema_path.stem}",
            "template": template,
            "settings": settings,
        })
    countdown_schema = json.loads((source / "sections/count-down-timer.schema.json").read_text(encoding="utf-8"))
    sections.append({
        "section_id": "synthetic-countdown-second",
        "template": "sections/count-down-timer.jinja",
        "settings": _fixture_for_schema(countdown_schema),
    })
    landing = next(item for item in preset["presets"] if item["path"] == "templates/landing.jinja")
    landing["settings"]["components"]["ar"] = sections
    landing["settings"]["components"]["en"] = sections
    (source / "preset.json").write_text(json.dumps(preset), encoding="utf-8")

    for language in ("ar", "en"):
        output = tmp_path / f"all-{language}.html"
        report = validate(source, FIXTURE, output, language=language)
        assert report.ok, report.errors
        assert len(report.rendered) == 20  # 18 section types + repeated countdown + landing
        rendered = output.read_text(encoding="utf-8")
        assert f'<html class="no-js" lang="{language}"' in rendered
        assert 'section-id="synthetic-count-down-timer.schema"' in rendered
        assert 'section-id="synthetic-countdown-second"' in rendered
        for section in sections:
            assert f'section-id="{section["section_id"]}"' in rendered


def test_validator_rejects_missing_relative_javascript_import(tmp_path: Path) -> None:
    package = tmp_path / "missing-js.zip"
    with zipfile.ZipFile(package, "w") as archive:
        archive.writestr("layout.jinja", "{% vitrin_head %}{% block content %}{% endblock %}{% vitrin_body %}")
        archive.writestr("templates/landing.jinja", '{% extends "layout.jinja" %}{% block content %}{% endblock %}')
        archive.writestr("assets/js/main.js", 'import "./missing-module.js";')
    report = validate(package)
    assert not report.ok
    assert any("local JS import is missing" in error for error in report.errors)


def test_validator_rejects_relative_javascript_path_traversal(tmp_path: Path) -> None:
    package = tmp_path / "unsafe-js.zip"
    with zipfile.ZipFile(package, "w") as archive:
        archive.writestr("layout.jinja", "{% vitrin_head %}{% block content %}{% endblock %}{% vitrin_body %}")
        archive.writestr("templates/landing.jinja", '{% extends "layout.jinja" %}{% block content %}{% endblock %}')
        archive.writestr("assets/js/main.js", 'import "../../layout.jinja";')
    report = validate(package)
    assert not report.ok
    assert any("unsafe relative JS import path" in error for error in report.errors)
