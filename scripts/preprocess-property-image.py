#!/usr/bin/env python3
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image


MAX_SIZE = 768
WHITE_THRESHOLD = 214


def is_white(pixel: tuple[int, int, int, int]) -> bool:
    return pixel[0] > WHITE_THRESHOLD and pixel[1] > WHITE_THRESHOLD and pixel[2] > WHITE_THRESHOLD


def remove_connected_white_background(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        if x < 0 or x >= width or y < 0 or y >= height:
            return
        index = y * width + x
        if visited[index]:
            return
        if not is_white(pixels[x, y]):
            return
        visited[index] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(1, height - 1):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        r, g, b, a = pixels[x, y]
        whiteness = min(r, g, b)
        fade = max(0, min(1, (whiteness - WHITE_THRESHOLD) / (255 - WHITE_THRESHOLD)))
        pixels[x, y] = (255, 255, 255, round(a * (1 - fade)))
        enqueue(x + 1, y)
        enqueue(x - 1, y)
        enqueue(x, y + 1)
        enqueue(x, y - 1)

    return image


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: preprocess-property-image.py SOURCE TARGET", file=sys.stderr)
        return 2

    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    target.parent.mkdir(parents=True, exist_ok=True)

    image = Image.open(source)
    image.thumbnail((MAX_SIZE, MAX_SIZE), Image.Resampling.LANCZOS)
    image = remove_connected_white_background(image)
    image.save(target, optimize=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
