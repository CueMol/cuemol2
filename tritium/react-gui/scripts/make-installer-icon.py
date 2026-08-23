#!/usr/bin/env python3
"""Regenerate the installer icons in build/ from a Phosphor glyph.

The installed application and the thing you download to install it must not
look the same. Badging the app icon was tried and rejected: at the sizes a
download folder actually uses, the badge is a dot. So the installer icons use
a different subject entirely -- a box with a download arrow -- while keeping
the app's charcoal so the two still read as one product.

  installer-icon.icns  macOS    DMG volume icon (dmg.icon)
  installer-icon.ico   Windows  NSIS installer + uninstaller icon

Both are generated here and tracked, rather than built during packaging,
because rasterizing an SVG needs cairo -- a native library that is not
otherwise required to build or package the app. Keeping the outputs in the
repo means nobody needs cairo unless they are changing the artwork.

  cd tritium/react-gui
  python3 -m venv /tmp/iconenv && /tmp/iconenv/bin/pip install cairosvg Pillow
  /tmp/iconenv/bin/python scripts/make-installer-icon.py

Requires cairo (`brew install cairo`), cairosvg, Pillow, and macOS `iconutil`
for the .icns. The glyph is read from the installed @phosphor-icons/react
package, so `pnpm install` must have run.

The app's own icons come from a different source and a different script --
see make-icons.py, which generates them from the master artwork PNG.

Phosphor Icons is MIT licensed (c) 2020 Phosphor Icons; see
build/ICON-ATTRIBUTION.md.
"""

import io
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import cairosvg
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit(
        "cairosvg and Pillow are required (and cairo itself):\n"
        "  brew install cairo && pip install cairosvg Pillow"
    )

REACT_GUI_DIR = Path(__file__).resolve().parent.parent
BUILD_DIR = REACT_GUI_DIR / "build"
PNPM_DIR = REACT_GUI_DIR.parent / "node_modules" / ".pnpm"

# Which Phosphor icon, at which weight. `fill` rather than an outline weight:
# the outline strokes close up into mush by 16px, where this icon has to be
# unmistakable at a glance -- that is the whole reason it exists.
GLYPH_NAME = "BoxArrowDown"
GLYPH_WEIGHT = "fill"
PHOSPHOR_WEIGHTS = ["bold", "duotone", "fill", "light", "regular", "thin"]

# The app icon's charcoal, so the installer reads as the same product.
TILE_COLOR = (58, 58, 63, 255)
GLYPH_COLOR = "#ffffff"

# Tile geometry as fractions of the canvas.
TILE_MARGIN = 0.03      # transparent edge, so the rounded corners are not clipped
TILE_RADIUS = 0.22      # corner radius
GLYPH_INSET = 0.20      # padding between the tile edge and the glyph

# Render at this size, then downscale every output from it.
MASTER_SIZE = 1024

# Same member lists the app icons use (see make-icons.py).
ICNS_ENTRIES = [
    (16, 1), (16, 2), (32, 1), (32, 2), (128, 1),
    (128, 2), (256, 1), (256, 2), (512, 1), (512, 2),
]
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def phosphor_defs_dir() -> Path:
    """Locate the installed @phosphor-icons/react def modules."""
    matches = sorted(PNPM_DIR.glob("@phosphor-icons+react@*/node_modules/@phosphor-icons/react/dist/defs"))
    if not matches:
        sys.exit(
            f"@phosphor-icons/react not found under {PNPM_DIR}.\n"
            "Run `pnpm install` in tritium/ first."
        )
    return matches[-1]


def glyph_paths(name: str, weight: str) -> list[str]:
    """The `d` attributes of one weight, out of a Phosphor def module.

    The defs are compiled JS with every weight in one Map, so slice out the
    requested weight's entry and read the paths from it.
    """
    src = (phosphor_defs_dir() / f"{name}.es.js").read_text()
    start = src.index(f'"{weight}",')
    later = [
        src.index(f'"{w}",', start + 1)
        for w in PHOSPHOR_WEIGHTS
        if f'"{w}",' in src[start + 1:]
    ]
    segment = src[start: min(later) if later else len(src)]
    paths = re.findall(r'd:\s*"([^"]+)"', segment)
    if not paths:
        sys.exit(f"no path data for {name} weight={weight}")
    return paths


def render_glyph(size: int) -> Image.Image:
    body = "".join(
        f'<path d="{d}" fill="{GLYPH_COLOR}"/>'
        for d in glyph_paths(GLYPH_NAME, GLYPH_WEIGHT)
    )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">'
        f"{body}</svg>"
    )
    png = cairosvg.svg2png(
        bytestring=svg.encode(), output_width=size, output_height=size
    )
    return Image.open(io.BytesIO(png)).convert("RGBA")


def build_icon() -> Image.Image:
    """The rounded charcoal tile with the glyph centred on it."""
    canvas = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    margin = int(MASTER_SIZE * TILE_MARGIN)
    draw.rounded_rectangle(
        (margin, margin, MASTER_SIZE - 1 - margin, MASTER_SIZE - 1 - margin),
        radius=int(MASTER_SIZE * TILE_RADIUS),
        fill=TILE_COLOR,
    )
    inset = int(MASTER_SIZE * GLYPH_INSET)
    glyph = render_glyph(MASTER_SIZE - 2 * inset)
    canvas.alpha_composite(glyph, (inset, inset))
    return canvas


def resized(img: Image.Image, size: int) -> Image.Image:
    return img.copy() if img.width == size else img.resize((size, size), Image.LANCZOS)


def report(path: Path) -> None:
    print(f"wrote {path.relative_to(REACT_GUI_DIR)} ({path.stat().st_size} bytes)")


def make_icns(img: Image.Image) -> None:
    if not shutil.which("iconutil"):
        print("skip installer-icon.icns: iconutil not available (macOS only)")
        return
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "installer.iconset"
        iconset.mkdir()
        for base, scale in ICNS_ENTRIES:
            suffix = "" if scale == 1 else "@2x"
            resized(img, base * scale).save(
                iconset / f"icon_{base}x{base}{suffix}.png", "PNG"
            )
        out = BUILD_DIR / "installer-icon.icns"
        subprocess.run(
            ["iconutil", "-c", "icns", str(iconset), "-o", str(out)], check=True
        )
        report(out)


def make_ico(img: Image.Image) -> None:
    # Members are pre-resized so each is downscaled with LANCZOS rather than by
    # the ICO writer, and the save runs on the full-size image because the
    # writer drops any requested size larger than the image it is called on.
    frames = [resized(img, s) for s in ICO_SIZES]
    out = BUILD_DIR / "installer-icon.ico"
    img.save(out, format="ICO", sizes=[(s, s) for s in ICO_SIZES], append_images=frames)
    report(out)


def main() -> None:
    print(f"glyph: {GLYPH_NAME} ({GLYPH_WEIGHT}) from {phosphor_defs_dir()}")
    icon = build_icon()
    make_icns(icon)
    make_ico(icon)


if __name__ == "__main__":
    main()
