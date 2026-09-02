#!/usr/bin/env python3
"""Regenerate the app icons in build/ from the master artwork PNGs.

There are two masters, both deliberately NOT kept in the repository -- only
the generated files below are tracked. Pass their paths explicitly; they
normally live outside the repo tree:

  cd tritium/react-gui
  python3 scripts/make-icons.py ~/path/to/cuemol3-app-icon-master.png \\
      --macos ~/path/to/cuemol3-icon-macos.png

Either may be given on its own; each regenerates only its own outputs, so
refreshing one platform's artwork never rewrites the other's.

MASTER (positional; 1024x1024 RGBA, the glyph on a transparent background
with a margin around it) feeds the Windows and Linux outputs:

  icon.ico   Windows  installer + .exe icon
  icon.png   Linux    electron-builder derives the icon set from it, and
                      main/helpers/appIcon.ts uses it as the dev-run window
                      icon (Electron's nativeImage reads PNG only, so a PNG
                      has to be tracked for that path to work)

Plus one renderer-side asset, which is bundled by Vite rather than read from
build/ (nothing outside src/ is importable from the renderer):

  src/renderer/assets/app-icon.png
             Win/Linux  the icon MenuBar.tsx draws at the left edge of the
                        in-app menu bar -- what reads as the title-bar icon on
                        Windows, where the app owns its own title bar

--macos MAC_MASTER feeds the macOS outputs and nothing else. The macOS icon is
a different design from the glyph: a rounded-square tile with its own
background, drawn to Apple's icon grid -- an 824x824 tile centered on a
1024x1024 canvas, leaving a transparent 100px margin on each side. Pass either
the bare 824x824 tile (it is placed on the canvas here) or a finished
1024x1024 canvas:

  icon.icns      macOS  .app bundle icon
  icon-mac.png   macOS  the dev-run dock icon (main/helpers/appIcon.ts): the
                        same artwork at 512px, tracked separately from
                        icon.png so Linux keeps the glyph

Regenerating every output of a master from that one file is the point: the
menu-bar asset is a separate file from build/icon.png and silently kept the
previous artwork when only the build/ icons were refreshed.

icon.png keeps MASTER's transparent border: it is shown large (the Linux
launcher entry, the dev-run window icon) alongside real platform icons and
has to be padded like them. icon.ico and app-icon.png are only ever drawn
small -- 16px in the Windows title bar and taskbar, 18px in the menu bar --
where the margin costs more visibility than it buys, so they come from a
tightened copy of the artwork. See `tightened()`.

Requires Pillow, plus macOS iconutil for the .icns (the other outputs are
produced on any platform).
"""

import argparse
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip3 install Pillow")

REACT_GUI_DIR = Path(__file__).resolve().parent.parent
BUILD_DIR = REACT_GUI_DIR / "build"
ASSETS_DIR = REACT_GUI_DIR / "src" / "renderer" / "assets"

# macOS iconset members: (base size, scale). iconutil requires this exact
# naming, and Retina displays render the @2x variants.
ICNS_ENTRIES = [
    (16, 1), (16, 2),
    (32, 1), (32, 2),
    (128, 1), (128, 2),
    (256, 1), (256, 2),
    (512, 1), (512, 2),
]

# Apple's macOS icon grid: the rounded tile is 824pt on a 1024pt canvas, with
# the remaining 100pt on each side transparent. Every .icns member is
# downscaled from this canvas.
MAC_CANVAS = 1024
MAC_TILE = 824

# Windows .ico members. 256 is the largest an .ico can carry; 24 and 48 are
# what Explorer picks for its medium list views.
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

# Tracked PNG size. 512 is the size electron-builder wants for the Linux icon
# set; going to the master's full 1024 only inflates the repo.
PNG_SIZE = 512

# Menu-bar asset size. Drawn at --icon-lg (18px), so 256 covers any DPI scale
# with room to spare; it is the size this asset has always been tracked at.
MENUBAR_PNG_SIZE = 256

# Transparent border left on each side by `tightened()`, as a fraction of the
# canvas. Not zero: butting the artwork against the edge clips its antialiased
# rim once the icon is downscaled to 16px.
TIGHT_MARGIN = 0.02


def load_master(path: Path) -> Image.Image:
    if not path.exists():
        sys.exit(f"master artwork not found: {path}")
    img = Image.open(path).convert("RGBA")
    if img.width != img.height:
        sys.exit(f"master artwork must be square, got {img.width}x{img.height}")
    if img.width < 1024:
        sys.exit(f"master artwork must be at least 1024x1024, got {img.width}")
    return img


def load_mac_master(path: Path) -> Image.Image:
    """Load the macOS artwork as a 1024x1024 icon-grid canvas.

    A bare 824x824 tile is centered on a transparent canvas; a 1024x1024 image
    is taken as an already-composed canvas. Anything else is rejected rather
    than scaled: the .icns is downscaled from master-resolution pixels, and a
    tile off Apple's grid would sit visibly larger or smaller than its
    neighbours in the Dock.
    """
    if not path.exists():
        sys.exit(f"macOS master artwork not found: {path}")
    img = Image.open(path).convert("RGBA")
    if img.width != img.height:
        sys.exit(f"macOS master artwork must be square, got {img.width}x{img.height}")
    if img.width == MAC_CANVAS:
        return img
    if img.width != MAC_TILE:
        sys.exit(
            f"macOS master artwork must be the {MAC_TILE}x{MAC_TILE} tile or a "
            f"finished {MAC_CANVAS}x{MAC_CANVAS} canvas, got {img.width}x{img.width}"
        )
    canvas = Image.new("RGBA", (MAC_CANVAS, MAC_CANVAS), (0, 0, 0, 0))
    offset = (MAC_CANVAS - MAC_TILE) // 2
    canvas.paste(img, (offset, offset))
    return canvas


def tightened(img: Image.Image) -> Image.Image:
    """Re-center the artwork on a canvas cropped close to its alpha bounds.

    The canvas shrinks around the artwork rather than the artwork being scaled
    up to fill it, so this step resamples nothing: every output still downscales
    from master-resolution pixels. The result is square, keeping the aspect of a
    non-square glyph intact.
    """
    bbox = img.getbbox()
    if bbox is None:
        sys.exit("master artwork is fully transparent")
    crop = img.crop(bbox)
    side = math.ceil(max(crop.width, crop.height) / (1 - 2 * TIGHT_MARGIN))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    return canvas


def resized(img: Image.Image, size: int) -> Image.Image:
    if img.width == size:
        return img.copy()
    return img.resize((size, size), Image.LANCZOS)


def report(path: Path) -> None:
    print(f"wrote {path.relative_to(REACT_GUI_DIR)} ({path.stat().st_size} bytes)")


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


def make_mac_png(img: Image.Image) -> None:
    out = BUILD_DIR / "icon-mac.png"
    resized(img, PNG_SIZE).save(out, "PNG", optimize=True)
    report(out)


def make_ico(img: Image.Image) -> None:
    # Every member is pre-resized and handed over through append_images, so
    # each one is downscaled with LANCZOS rather than by the ICO writer.
    #
    # The image the save is called ON must be the full-size one, not the
    # smallest frame: the writer drops any requested size larger than that
    # image, so starting from the 16x16 frame silently yields a
    # single-member .ico.
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


def make_menubar_png(img: Image.Image) -> None:
    out = ASSETS_DIR / "app-icon.png"
    resized(img, MENUBAR_PNG_SIZE).save(out, "PNG", optimize=True)
    report(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "master", type=Path, nargs="?",
        help="1024x1024 glyph PNG for the Windows / Linux outputs",
    )
    parser.add_argument(
        "--macos", type=Path, metavar="MAC_MASTER",
        help=f"{MAC_TILE}x{MAC_TILE} tile (or {MAC_CANVAS}x{MAC_CANVAS} canvas) "
             "PNG for the macOS outputs",
    )
    args = parser.parse_args()
    if args.master is None and args.macos is None:
        parser.error("pass the master PNG, --macos MAC_MASTER, or both")

    if args.macos is not None:
        mac = load_mac_master(args.macos)
        print(f"macOS master: {args.macos} -> {mac.width}x{mac.height} canvas")
        make_icns(mac)
        make_mac_png(mac)

    if args.master is not None:
        img = load_master(args.master)
        print(f"master: {args.master} ({img.width}x{img.height})")
        # icon.png keeps the master's border; the two outputs that are always
        # drawn small are tightened.
        make_png(img)
        tight = tightened(img)
        print(f"tightened for the small-icon outputs: {tight.width}x{tight.width}")
        make_ico(tight)
        make_menubar_png(tight)


if __name__ == "__main__":
    main()
