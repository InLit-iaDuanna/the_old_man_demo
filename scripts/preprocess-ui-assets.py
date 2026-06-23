#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
UI_DIR = ROOT / "UI"
OUTPUT_DIR = ROOT / "web" / "generated" / "ui_mobile"


ASSETS = [
    ("小满启信封图标.png", "mail-icon.png", "trim_png"),
    ("记忆碎片1的提示图标.png", "memory-1-icon.png", "trim_png"),
    ("记忆碎片2的提示图标.png", "memory-2-icon.png", "trim_png"),
    ("爷爷的信.png", "letter-grandpa.png", "full_png"),
    ("记忆碎片1.png", "memory-1-card.png", "full_png"),
    ("记忆碎片2（1）.png", "memory-2-1-card.png", "full_png"),
    ("记忆碎片2（2）.png", "memory-2-2-card.png", "full_png"),
    ("记忆碎片2（3）.png", "memory-2-3-card.png", "full_png"),
]

STALE_RUNTIME_IMAGES = [
    "loading-bg.jpg",
    "pause-bg.png",
    "ending-1.png",
    "ending-2.png",
    "pause-icon.png",
    "settings-icon.png",
    "camera-icon.png",
    "play-icon.png",
    "restart-icon.png",
    "tap-button.png",
]


def save_png(image: Image.Image, target: Path) -> None:
    image.save(target, optimize=True)


def save_jpg(image: Image.Image, target: Path) -> None:
    background = Image.new("RGB", image.size, "#f5efe3")
    if image.mode == "RGBA":
        background.paste(image, mask=image.getchannel("A"))
    else:
        background.paste(image.convert("RGB"))
    background.save(target, quality=82, optimize=True, progressive=True)


def trim_alpha(image: Image.Image, padding: int = 8) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = rgba.getbbox()
    if not bbox:
        return rgba

    left, top, right, bottom = bbox
    left = max(left - padding, 0)
    top = max(top - padding, 0)
    right = min(right + padding, rgba.width)
    bottom = min(bottom + padding, rgba.height)
    return rgba.crop((left, top, right, bottom))


def resize_for_mobile(image: Image.Image, max_width: int = 768) -> Image.Image:
    if image.width <= max_width:
        return image

    ratio = max_width / image.width
    height = round(image.height * ratio)
    return image.resize((max_width, height), Image.Resampling.LANCZOS)


def main() -> int:
    if not UI_DIR.exists():
        print(f"missing UI directory: {UI_DIR}", file=sys.stderr)
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale_name in STALE_RUNTIME_IMAGES:
        stale_path = OUTPUT_DIR / stale_name
        if stale_path.exists():
            stale_path.unlink()

    written = []
    for source_name, output_name, mode in ASSETS:
        source = UI_DIR / source_name
        if not source.exists():
            print(f"skip missing {source_name}")
            continue

        image = Image.open(source)
        if mode == "trim_png":
            output = resize_for_mobile(trim_alpha(image))
            save_png(output, OUTPUT_DIR / output_name)
        elif mode == "full_jpg":
            output = resize_for_mobile(image.convert("RGBA"))
            save_jpg(output, OUTPUT_DIR / output_name)
        else:
            output = resize_for_mobile(image.convert("RGBA"))
            save_png(output, OUTPUT_DIR / output_name)
        written.append(output_name)

    print(f"Wrote {len(written)} UI assets to {OUTPUT_DIR}")
    for name in written:
        print(f"- {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
