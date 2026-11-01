#!/usr/bin/env python3
"""Build the native Jinja product-landing-page package.

The source tree is intentionally kept human-editable.  This builder copies the
authored native entry templates and assets, then writes a deterministic zip
suitable for the theme-version upload.
No network or platform credentials are used here.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import stat
import subprocess
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

MAX_PACKAGE_BYTES = 50 * 1024 * 1024
MAX_ASSET_BYTES = 2 * 1024 * 1024
REQUIRED_TEMPLATES = ("layout.jinja", "templates/landing.jinja")
ALLOWED_DIRECTORIES = {"assets", "components", "layouts", "locale", "sections", "templates"}


def _is_file(path: Path) -> bool:
    return path.is_file() and not path.is_symlink()


def _iter_source_files(root: Path) -> Iterable[tuple[str, Path]]:
    """Yield source files using the platform's canonical archive paths."""
    for filename in ("layout.jinja", "layout.json", "layout.schema.json"):
        path = root / filename
        if _is_file(path):
            yield filename, path
    for directory in sorted(ALLOWED_DIRECTORIES):
        base = root / directory
        if not base.is_dir():
            continue
        for path in sorted(p for p in base.rglob("*") if _is_file(p)):
            yield path.relative_to(root).as_posix(), path


def _read_files(root: Path) -> dict[str, bytes]:
    files: dict[str, bytes] = {
        path: source.read_bytes() for path, source in _iter_source_files(root)
    }
    missing = set(REQUIRED_TEMPLATES) - files.keys()
    if missing:
        raise ValueError(f"missing required authored template(s): {', '.join(sorted(missing))}")
    return dict(sorted(files.items()))


def inventory(files: dict[str, bytes]) -> list[dict[str, Any]]:
    return [
        {"path": path, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}
        for path, content in files.items()
        if path.startswith("assets/")
    ]


def build(source: Path, output: Path, manifest_path: Path | None = None) -> dict[str, Any]:
    source = source.resolve()
    files = _read_files(source)
    if not all(path in files for path in REQUIRED_TEMPLATES):
        raise ValueError("native package is missing a required template")
    # Compile reusable source modules to a classic script supported by the asset CDN.
    subprocess.run(["node", str(Path(__file__).with_name("build-runtime.mjs")), str(source)], check=True)
    files = _read_files(source)
    total = sum(len(content) for content in files.values())
    if total > MAX_PACKAGE_BYTES:
        raise ValueError(f"uncompressed package exceeds {MAX_PACKAGE_BYTES} bytes")
    oversized = [(path, len(content)) for path, content in files.items() if path.startswith("assets/") and len(content) > MAX_ASSET_BYTES]
    if oversized:
        details = ", ".join(f"{path} ({size} bytes)" for path, size in oversized)
        raise ValueError(f"asset exceeds {MAX_ASSET_BYTES} bytes: {details}")

    output.parent.mkdir(parents=True, exist_ok=True)
    fixed_date = (1980, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, content in files.items():
            info = zipfile.ZipInfo(PurePosixPath(path).as_posix(), date_time=fixed_date)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, content)
    size = output.stat().st_size
    if size > MAX_PACKAGE_BYTES:
        raise ValueError(f"archive exceeds {MAX_PACKAGE_BYTES} bytes")

    result = {
        "archive": str(output),
        "bytes": size,
        "files": len(files),
        "assets": inventory(files),
    }
    if manifest_path:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, default=Path("dist/bnfsj.zip"))
    parser.add_argument("--manifest", type=Path, default=None)
    args = parser.parse_args()
    try:
        result = build(args.source, args.output, args.manifest)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        parser.error(str(exc))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
