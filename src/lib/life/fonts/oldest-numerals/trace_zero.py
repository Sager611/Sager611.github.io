#!/usr/bin/env python3
"""Trace the Late Babylonian zero sign from Thureau-Dangin's 1922 hand copy.

Source: F. Thureau-Dangin (1922), Tablettes d'Uruk (Textes cuneiformes du
Louvre 6), hand copy of the Seleucid table AO 6456 from Uruk; public domain.
sources/ao6456-zero.png is one instance of the two-wedge sign, cut from the
CDLI scan https://cdli.mpiwg-berlin.mpg.de/dl/lineart/P254386_l.jpg
(1752 x 2736 px) at x 378-432, y 354-387.

The copyist drew each wedge as a triangle outline with a tail, plus a short
spike on top. This script fits those pen strokes (vertices and pen width) to
the scan by least squares, saves them as sources/zero-strokes.svg, and turns
the strokes into a filled outline, sources/zero-trace.svg, used by build.py.

Run from the repo root:
    uv run --with resvg-py --with potracer --with pillow --with numpy python src/lib/life/fonts/oldest-numerals/trace_zero.py
"""

from __future__ import annotations

import base64
import io
from pathlib import Path

import numpy as np
import potrace
import resvg_py
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
SCAN = HERE / "sources" / "ao6456-zero.png"
STROKES = HERE / "sources" / "zero-strokes.svg"
TRACE = HERE / "sources" / "zero-trace.svg"
WIDTH, HEIGHT = 54, 33
REGION = (20, 3, 46, 31)
OUTLINE_SCALE = 40
# Starting guess in scan pixels: spike top, apex, upper-left, upper-right, upper tail end,
# lower apex, lower-left, lower-right, lower tail end, pen width.
START = [29.7, 6.0, 30.0, 9.8, 26.2, 14.4, 34.0, 15.0, 41.4, 20.3,
         30.3, 16.0, 26.3, 21.0, 32.3, 21.3, 41.8, 27.8, 1.6]


def strokes_svg(p: list[float], scale: int = 1) -> str:
    sx, sy, ax, ay, lx, ly, rx, ry, tx, ty, bx, by, mx, my, nx, ny, ux, uy, pen = p
    paths = (
        f"M{sx:.2f} {sy:.2f}L{ax:.2f} {ay:.2f}",
        f"M{ax:.2f} {ay:.2f}L{lx:.2f} {ly:.2f}L{rx:.2f} {ry:.2f}Z",
        f"M{rx:.2f} {ry:.2f}L{tx:.2f} {ty:.2f}",
        f"M{bx:.2f} {by:.2f}L{mx:.2f} {my:.2f}L{nx:.2f} {ny:.2f}Z",
        f"M{nx:.2f} {ny:.2f}L{ux:.2f} {uy:.2f}",
    )
    body = "".join(f'<path d="{d}"/>' for d in paths)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH * scale}" height="{HEIGHT * scale}" viewBox="0 0 {WIDTH} {HEIGHT}">'
        f'<g fill="none" stroke="#000" stroke-width="{pen:.2f}" stroke-linecap="round" stroke-linejoin="round">{body}</g></svg>\n'
    )


def render(svg: str, width: int, height: int) -> np.ndarray:
    data = resvg_py.svg_to_bytes(svg_string=svg, width=width, height=height)
    if isinstance(data, str):
        data = base64.b64decode(data)
    image = Image.open(io.BytesIO(bytes(data))).convert("RGBA").getchannel("A")
    if image.size != (width, height):
        image = image.resize((width, height), Image.Resampling.LANCZOS)
    return np.asarray(image, dtype=np.float32) / 255


def error(p: list[float], target: np.ndarray, mask: np.ndarray) -> float:
    ink = Image.fromarray(np.uint8(np.round(render(strokes_svg(p), WIDTH, HEIGHT) * 255)))
    ink = np.asarray(ink.filter(ImageFilter.GaussianBlur(0.5)), dtype=np.float32) / 255
    return float((((ink - target) ** 2) * mask).sum())


def fit() -> tuple[list[float], float, float]:
    target = 1 - np.asarray(Image.open(SCAN).convert("L"), dtype=np.float32) / 255
    mask = np.zeros_like(target)
    x0, y0, x1, y1 = REGION
    mask[y0:y1, x0:x1] = 1
    p = list(START)
    start = best = error(p, target, mask)
    for step in (0.4, 0.2, 0.1, 0.05):
        for _ in range(40):
            improved = False
            for i in range(len(p)):
                for delta in (step, -step):
                    trial = list(p)
                    trial[i] += delta if i < len(p) - 1 else delta / 2
                    if trial[-1] < 0.8:
                        continue
                    value = error(trial, target, mask)
                    if value < best - 1e-6:
                        p, best, improved = trial, value, True
            if not improved:
                break
    return p, start, best


def outline(p: list[float]) -> tuple[str, int]:
    width, height = WIDTH * OUTLINE_SCALE, HEIGHT * OUTLINE_SCALE
    ink = render(strokes_svg(p, OUTLINE_SCALE), width, height) > 0.5
    for data in (ink, ~ink):
        curves = list(potrace.Bitmap(data).trace(turdsize=OUTLINE_SCALE, alphamax=1.0, opticurve=True, opttolerance=0.2))
        xs = [point[0] for curve in curves for point in corners(curve)]
        if curves and min(xs) > 1 and max(xs) < width - 1:
            return path_data(curves), len(curves)
    raise RuntimeError("potrace traced the frame instead of the sign")


def xy(point: tuple[float, float] | potrace._Point) -> tuple[float, float]:
    if hasattr(point, "x"):
        return float(point.x), float(point.y)
    return float(point[0]), float(point[1])


def corners(curve: potrace._Curve) -> list[tuple[float, float]]:
    result = [xy(curve.start_point)]
    for segment in curve.segments:
        result += [xy(segment.c)] if segment.is_corner else [xy(segment.c1), xy(segment.c2)]
        result.append(xy(segment.end_point))
    return result


def path_data(curves: list[potrace._Curve]) -> str:
    parts: list[str] = []
    for curve in curves:
        x, y = xy(curve.start_point)
        parts.append(f"M{x:.1f} {y:.1f}")
        for segment in curve.segments:
            if segment.is_corner:
                (cx, cy), (ex, ey) = xy(segment.c), xy(segment.end_point)
                parts.append(f"L{cx:.1f} {cy:.1f}L{ex:.1f} {ey:.1f}")
            else:
                (ax, ay), (bx, by), (ex, ey) = xy(segment.c1), xy(segment.c2), xy(segment.end_point)
                parts.append(f"C{ax:.1f} {ay:.1f} {bx:.1f} {by:.1f} {ex:.1f} {ey:.1f}")
        parts.append("Z")
    return "".join(parts)


def main() -> None:
    p, start, best = fit()
    STROKES.write_text(strokes_svg([round(v, 2) for v in p]))
    d, count = outline(p)
    TRACE.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH * OUTLINE_SCALE} {HEIGHT * OUTLINE_SCALE}"><path d="{d}"/></svg>\n'
    )
    print(f"fit error {start:.2f} -> {best:.2f}; pen {p[-1]:.2f} px")
    print("points", [round(v, 2) for v in p])
    print(f"{count} contours -> {TRACE.relative_to(HERE)}")


if __name__ == "__main__":
    main()
