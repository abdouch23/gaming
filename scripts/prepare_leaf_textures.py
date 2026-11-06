#!/usr/bin/env python3
"""Extract the atlas's top-row leaf maps into aligned, transparent textures."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter


SIZE = (256, 512)
ATLAS_TOP = 64
ATLAS_BOTTOM = 727
MAPS = {
    "base-color": (0, 334, (0, 0, 0)),
    "normal": (335, 636, (128, 128, 255)),
    "roughness": (637, 938, (255, 255, 255)),
    "ao": (1239, 1536, (255, 255, 255)),
}


def largest_component(image: Image.Image, threshold: int) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Return the largest 8-connected bright component and its bounding box."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.tobytes()
    foreground = bytearray(
        1 if max(pixels[index : index + 3]) > threshold else 0
        for index in range(0, len(pixels), 3)
    )
    visited = bytearray(width * height)
    largest: list[int] = []

    for start, active in enumerate(foreground):
        if not active or visited[start]:
            continue
        visited[start] = 1
        queue = deque([start])
        component = []
        while queue:
            index = queue.popleft()
            component.append(index)
            x, y = index % width, index // width
            for ny in range(max(0, y - 1), min(height, y + 2)):
                row = ny * width
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = row + nx
                    if foreground[neighbor] and not visited[neighbor]:
                        visited[neighbor] = 1
                        queue.append(neighbor)
        if len(component) > len(largest):
            largest = component

    if not largest:
        raise ValueError("No leaf foreground found; lower the threshold or check the atlas.")

    xs = [index % width for index in largest]
    ys = [index // width for index in largest]
    bounds = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    mask = Image.new("L", (width, height), 0)
    mask_data = bytearray(width * height)
    for index in largest:
        mask_data[index] = 255
    mask.frombytes(bytes(mask_data))
    return mask, bounds


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "source",
        nargs="?",
        type=Path,
        default=repo / ".hoplite/attachments/art_upload_e4e525c2b1c1469fb556159d56ab92d9/Leaf Texture Map Showcase.png",
        help="source atlas (defaults to the supplied leaf showcase attachment)",
    )
    parser.add_argument("--output-dir", type=Path, default=repo / "assets/leaf")
    args = parser.parse_args()

    with Image.open(args.source) as atlas:
        atlas = atlas.convert("RGB")
    if atlas.size != (1536, 1024):
        raise ValueError(f"Expected a 1536x1024 atlas, got {atlas.width}x{atlas.height}.")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    cropped: dict[str, Image.Image] = {}
    bounds: dict[str, tuple[int, int, int, int]] = {}
    for name, (left, right, _) in MAPS.items():
        section = atlas.crop((left, ATLAS_TOP, right, ATLAS_BOTTOM))
        _, box = largest_component(section, threshold=12)
        cropped[name] = section.crop(box)
        bounds[name] = box

    base = cropped["base-color"].convert("RGB")
    component, _ = largest_component(base, threshold=12)
    alpha = component.filter(ImageFilter.GaussianBlur(radius=0.65)).resize(
        SIZE, Image.Resampling.LANCZOS
    )

    for name, (_, _, neutral) in MAPS.items():
        color = cropped[name].resize(SIZE, Image.Resampling.LANCZOS).convert("RGB")
        color.putalpha(alpha.copy())
        pixels = color.load()
        alpha_pixels = alpha.load()
        for y in range(SIZE[1]):
            for x in range(SIZE[0]):
                if alpha_pixels[x, y] == 0:
                    pixels[x, y] = (*neutral, 0)
        output = args.output_dir / f"{name}.png"
        color.save(output, optimize=True)
        print(f"{output}: RGBA {SIZE[0]}x{SIZE[1]}, source bounds {bounds[name]}")


if __name__ == "__main__":
    main()
