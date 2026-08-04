#!/usr/bin/env python3
"""Regenerate the app icons in build/ from a master artwork PNG.

The master (1024x1024 RGBA, transparent background) is deliberately NOT kept
in the repository -- only the generated files below are tracked. Pass its path
explicitly; it normally lives outside the repo tree:

  cd tritium/react-gui
  python3 scripts/make-icons.py ~/path/to/cuemol3-app-icon-master.png

Generated into build/, which is electron-builder's buildResources directory,
so every target picks its file up by name with no electron-builder.yml entry:

  icon.icns  macOS    .app bundle icon
  icon.ico   Windows  installer + .exe icon
  icon.png   Linux    electron-builder derives the icon set from it, and
                      main/helpers/appIcon.ts uses it as the dev-run window /
                      dock icon (Electron's nativeImage reads PNG only, so a
                      PNG has to be tracked for that path to work)

Requires Pillow, plus macOS iconutil for the .icns (the other outputs are
produced on any platform).
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip3 install Pillow")

BUILD_DIR = Path(__file__).resolve().parent.parent / "build"

# macOS iconset members: (base size, scale). iconutil requires this exact
# naming, and Retina displays render the @2x variants.
ICNS_ENTRIES = [
    (16, 1), (16, 2),
    (32, 1), (32, 2),
    (128, 1), (128, 2),
    (256, 1), (256, 2),
    (512, 1), (512, 2),
]

# Windows .ico members. 256 is the largest an .ico can carry; 24 and 48 are
# what Explorer picks for its medium list views.
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

# Tracked PNG size. 512 is the size electron-builder wants for the Linux icon
# set; going to the master's full 1024 only inflates the repo.
PNG_SIZE = 512


def load_master(path: Path) -> Image.Image:
    if not path.exists():
        sys.exit(f"master artwork not found: {path}")
    img = Image.open(path).convert("RGBA")
    if img.width != img.height:
        sys.exit(f"master artwork must be square, got {img.width}x{img.height}")
    if img.width < 1024:
        sys.exit(f"master artwork must be at least 1024x1024, got {img.width}")
    return img


def resized(img: Image.Image, size: int) -> Image.Image:
    if img.width == size:
        return img.copy()
    return img.resize((size, size), Image.LANCZOS)


def report(path: Path) -> None:
    print(f"wrote {path.relative_to(BUILD_DIR.parent)} ({path.stat().st_size} bytes)")


def make_icns(img: Image.Image) -> None:
    if not shutil.which("iconutil"):
        print("skip icon.icns: iconutil not available (macOS only)")
        return
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "icon.iconset"
        iconset.mkdir()
        for base, scale in ICNS_ENTRIES:
            suffix = "" if scale == 1 else "@2x"
            name = f"icon_{base}x{base}{suffix}.png"
            resized(img, base * scale).save(iconset / name, "PNG")
        out = BUILD_DIR / "icon.icns"
        subprocess.run(
            ["iconutil", "-c", "icns", str(iconset), "-o", str(out)],
            check=True,
        )
        report(out)


def make_ico(img: Image.Image) -> None:
    # Every member is pre-resized and handed over through append_images, so
    # each one is downscaled with LANCZOS rather than by the ICO writer.
    #
    # The image the save is called ON must be the master, not the smallest
    # frame: the writer drops any requested size larger than that image, so
    # starting from the 16x16 frame silently yields a single-member .ico.
    frames = [resized(img, s) for s in ICO_SIZES]
    out = BUILD_DIR / "icon.ico"
    img.save(
        out,
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=frames,
    )
    report(out)


def make_png(img: Image.Image) -> None:
    out = BUILD_DIR / "icon.png"
    resized(img, PNG_SIZE).save(out, "PNG", optimize=True)
    report(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("master", type=Path, help="path to the 1024x1024 master PNG")
    args = parser.parse_args()

    img = load_master(args.master)
    print(f"master: {args.master} ({img.width}x{img.height})")
    make_icns(img)
    make_ico(img)
    make_png(img)


if __name__ == "__main__":
    main()
