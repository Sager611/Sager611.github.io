#!/usr/bin/env python3
"""Build "Oldest Numerals": the oldest known symbols for 1 and 0 as a font.

0: Late Babylonian placeholder zero (Seleucid Uruk, c. 300 BCE), traced from
   Thureau-Dangin's 1922 hand copy of the tablet AO 6456 by trace_zero.py
   (sources/zero-trace.svg); the hand copy is in the public domain.
1: One V-section incision, the unit mark of the oldest notched bones
   (Les Pradelles, 72-60 ka; Border Cave, 44-42 ka). Drawn as a thin
   spindle, tilted 6 degrees.

Run from the repo root:
    uv run --with fonttools --with brotli python src/lib/life/fonts/oldest-numerals/build.py
"""

from __future__ import annotations

import math
import re
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.misc.transform import Transform
from fontTools.pens.areaPen import AreaPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.recordingPen import RecordingPen, replayRecording
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph

Point = tuple[float, float]
Recording = list[tuple[str, tuple[Point | None, ...]]]
Bounds = tuple[float, float, float, float]

HERE = Path(__file__).resolve().parent
ZERO_TRACE = HERE / "sources" / "zero-trace.svg"
FAMILY = "Oldest Numerals"
PS_NAME = "OldestNumerals-Regular"
UPM = 1000
ADVANCE = 700
CX, CY = ADVANCE / 2, 350
CMAP = {0x20: "space", 0x30: "zero", 0x31: "one", 0x12472: "zero", 0x1D377: "one"}


def bounds(recording: Recording) -> Bounds:
    pen = BoundsPen(None)
    replayRecording(recording, pen)
    assert pen.bounds is not None
    return pen.bounds


def traced_zero(svg_path: Path) -> Glyph:
    svg = svg_path.read_text()
    view_box = re.search(r'viewBox="([^"]+)"', svg)
    path = re.search(r'\sd="([^"]+)"', svg)
    assert view_box and path
    height = float(view_box.group(1).split()[3])
    flipped = RecordingPen()
    parse_path(path.group(1), TransformPen(flipped, Transform(1, 0, 0, -1, 0, height)))
    x0, y0, x1, y1 = bounds(flipped.value)
    scale = 600 / max(x1 - x0, y1 - y0)
    fit = Transform().translate(CX, CY).scale(scale).translate(-(x0 + x1) / 2, -(y0 + y1) / 2)
    area = AreaPen()
    replayRecording(flipped.value, area)
    pen = TTGlyphPen(None)
    quadratic = Cu2QuPen(pen, max_err=1.0)
    # TrueType wants clockwise outer contours (negative area in fontTools).
    target = ReverseContourPen(quadratic) if area.value > 0 else quadratic
    replayRecording(flipped.value, TransformPen(target, fit))
    return pen.glyph()


def tally_notch() -> Glyph:
    pen = TTGlyphPen(None)
    tilt = Transform().translate(CX, CY).rotate(math.radians(-6)).translate(-CX, -CY)
    draw = TransformPen(Cu2QuPen(pen, max_err=1.0), tilt)
    draw.moveTo((CX, 700))
    draw.curveTo((CX + 20, 690), (CX + 48, 560), (CX + 48, 440))
    draw.curveTo((CX + 48, 300), (CX + 14, 90), (CX, 0))
    draw.curveTo((CX - 14, 90), (CX - 48, 300), (CX - 48, 440))
    draw.curveTo((CX - 48, 560), (CX - 20, 690), (CX, 700))
    draw.closePath()
    return pen.glyph()


def empty() -> Glyph:
    return TTGlyphPen(None).glyph()


def write_svgs(ttf: Path, out_dir: Path) -> None:
    out_dir.mkdir(exist_ok=True)
    glyph_set = TTFont(ttf).getGlyphSet()
    for name in ("zero", "one"):
        pen = SVGPathPen(glyph_set)
        glyph_set[name].draw(pen)
        (out_dir / f"{name}.svg").write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -800 {ADVANCE} 1000">'
            f'<path transform="scale(1 -1)" fill="currentColor" d="{pen.getCommands()}"/></svg>\n'
        )


def build(out_dir: Path) -> None:
    glyphs = {".notdef": empty(), "space": empty(), "zero": traced_zero(ZERO_TRACE), "one": tally_notch()}
    advances = {".notdef": ADVANCE, "space": ADVANCE // 2, "zero": ADVANCE, "one": ADVANCE}
    builder = FontBuilder(UPM, isTTF=True)
    builder.setupGlyphOrder(list(glyphs))
    builder.setupCharacterMap(CMAP)
    builder.setupGlyf(glyphs)
    glyf = builder.font["glyf"]
    builder.setupHorizontalMetrics(
        {name: (advances[name], getattr(glyf[name], "xMin", 0)) for name in glyphs}
    )
    builder.setupHorizontalHeader(ascent=800, descent=-200)
    builder.setupNameTable(
        {
            "copyright": "Copyright 2026 Adrian Sager. Zero traced from F. Thureau-Dangin, Tablettes d'Uruk (1922), public domain.",
            "familyName": FAMILY,
            "styleName": "Regular",
            "uniqueFontIdentifier": f"1.000;{PS_NAME}",
            "fullName": f"{FAMILY} Regular",
            "psName": PS_NAME,
            "version": "Version 1.000",
            "description": "The oldest known symbols for 1 (a tally incision) and 0 (the Late Babylonian placeholder, traced from Thureau-Dangin's 1922 hand copy).",
            "licenseDescription": "This Font Software is licensed under the SIL Open Font License, Version 1.1. This license is available with a FAQ at: https://openfontlicense.org",
            "licenseInfoURL": "https://openfontlicense.org",
        }
    )
    builder.setupOS2(
        sTypoAscender=800,
        sTypoDescender=-200,
        sTypoLineGap=0,
        usWinAscent=900,
        usWinDescent=200,
        achVendID="NONE",
        fsType=0,
    )
    builder.setupPost()
    ttf = out_dir / f"{PS_NAME}.ttf"
    builder.save(str(ttf))
    woff2 = TTFont(ttf)
    woff2.flavor = "woff2"
    woff2.save(str(out_dir / f"{PS_NAME}.woff2"))
    write_svgs(ttf, out_dir / "glyphs")


def main() -> None:
    build(HERE)
    for path in sorted(HERE.rglob("*")):
        if path.is_file() and path.suffix in {".ttf", ".woff2", ".svg"}:
            print(f"{path.relative_to(HERE)}  {path.stat().st_size} B")


if __name__ == "__main__":
    main()
