#!/usr/bin/env python3
"""Turn an opaque ChatGPT cloud render (white cloud on near-white sky) into a
soft-alpha sprite texture for the world-space cloud system.

Strategy: flood-fill the *connected* bright+neutral background in from the
border (so the warmer cloud body and any enclosed bright highlights survive),
then feather the resulting mask so sprite edges stay soft — no hard white
fringe, no square base plate, no pink/magenta artifacts. RGB is left untouched
(the cloud is light) so the per-mode SpriteMaterial tint multiplies cleanly.

Usage: preprocess-cloud-image.py <src.png> <dst.png> [max_size]
"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

DEFAULT_MAX_SIZE = 768
# Background = bright AND near-neutral. The cloud body is warm (max-min large),
# so neutrality separates sky from cloud even when both are light.
BG_MIN_BRIGHTNESS = 242
BG_MAX_CHROMA = 10
FEATHER_RADIUS = 2.4
# Transparent breathing room so a wide cloud never clips at the texture edge.
MARGIN_FRAC = 0.04


def is_background(pixel: tuple[int, int, int]) -> bool:
    r, g, b = pixel[0], pixel[1], pixel[2]
    lo = min(r, g, b)
    hi = max(r, g, b)
    return lo >= BG_MIN_BRIGHTNESS and (hi - lo) <= BG_MAX_CHROMA


def build_alpha(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    px = rgb.load()
    w, h = rgb.size
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        if x < 0 or x >= w or y < 0 or y >= h:
            return
        idx = y * w + x
        if visited[idx]:
            return
        if not is_background(px[x, y]):
            return
        visited[idx] = 1
        q.append((x, y))

    for x in range(w):
        enqueue(x, 0)
        enqueue(x, h - 1)
    for y in range(h):
        enqueue(0, y)
        enqueue(w - 1, y)

    while q:
        x, y = q.popleft()
        enqueue(x + 1, y)
        enqueue(x - 1, y)
        enqueue(x, y + 1)
        enqueue(x, y - 1)

    alpha = Image.new("L", (w, h), 255)
    ap = alpha.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            if visited[row + x]:
                ap[x, y] = 0
    return alpha.filter(ImageFilter.GaussianBlur(FEATHER_RADIUS))


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    max_size = int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_MAX_SIZE

    image = Image.open(src).convert("RGB")
    alpha = build_alpha(image)
    rgba = image.convert("RGBA")
    rgba.putalpha(alpha)

    # Crop to content, then center on a padded transparent canvas so no cloud
    # edge ever touches (and hard-clips at) the texture border.
    bbox = alpha.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    cw, ch = rgba.size
    pad = round(max(cw, ch) * MARGIN_FRAC)
    canvas = Image.new("RGBA", (cw + 2 * pad, ch + 2 * pad), (0, 0, 0, 0))
    canvas.alpha_composite(rgba, (pad, pad))
    rgba = canvas

    w, h = rgba.size
    if max(w, h) > max_size:
        scale = max_size / max(w, h)
        rgba = rgba.resize((round(w * scale), round(h * scale)), Image.LANCZOS)

    dst.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(dst, "PNG", optimize=True)

    out_alpha = rgba.split()[3]
    opaque = sum(1 for p in out_alpha.getdata() if p > 8)
    total = rgba.size[0] * rgba.size[1]
    print(
        f"{src.name} -> {dst} | out {rgba.size} | "
        f"cloud coverage {opaque / total:.1%} | src bbox {bbox}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
