"""Build static Market Shadows. Report data is supplied by the user at runtime."""

import argparse
from hashlib import sha256
from pathlib import Path
import shutil
import tempfile
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
BASE = "https://cdn.sheetjs.com/xlsx-0.20.3/package/"
VENDOR = {
    "xlsx.full.min.js": ("dist/xlsx.full.min.js", "cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41"),
    "SHEETJS-LICENSE": ("LICENSE", "4d2a38ac35cda06a555c84074a819d413339cd3691b822cae50f8f322fe01f64"),
}


def asset(name, vendor_dir):
    path, digest = VENDOR[name]
    if vendor_dir:
        contents = (vendor_dir / name).read_bytes()
    else:
        request = Request(BASE + path, headers={"User-Agent": "CoolCode Market Shadows build"})
        with urlopen(request, timeout=45) as response:
            contents = response.read(2_000_000)
    if sha256(contents).hexdigest() != digest:
        raise SystemExit(f"SHA-256 check failed for {name}")
    return contents


def build(vendor_dir):
    assets = {name: asset(name, vendor_dir) for name in VENDOR}
    with tempfile.TemporaryDirectory(dir=ROOT) as directory:
        staging = Path(directory) / "site"
        shutil.copytree(ROOT / "web", staging)
        vendor = staging / "vendor"
        vendor.mkdir()
        for name, contents in assets.items():
            (vendor / name).write_bytes(contents)
        if DIST.exists():
            shutil.rmtree(DIST)
        staging.replace(DIST)
    print("Built Market Shadows with pinned SheetJS 0.20.3 into dist/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vendor-dir", type=Path, help="Use local copies of the two pinned SheetJS assets.")
    build(parser.parse_args().vendor_dir)
