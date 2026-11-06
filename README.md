# Arboreal — Tree Material Studio

An Arabic/RTL, real-time street-tree editor based on the supplied tree-generator HTML. Uses the original Three.js r128 (0.128.0), vendored with its MIT license; no CDN, fonts, npm install, or build step is required to run it.

## Run

```sh
python3 -m http.server 3000 --bind 0.0.0.0
```

Open `http://localhost:3000`. The managed Preview uses the same command from `.hoplite/settings.json`.

- Drag to orbit; wheel or pinch to zoom. Reset the view or save a PNG from the viewport toolbar.
- Choose studio, daylight, or sunset lighting; adjust exposure and sun direction.
- Adjust leaf roughness, normal strength, and waxy clearcoat. Click a map to inspect it; Escape closes the dialog.
- Scroll the settings panel for seeded tree generation, five presets, dimensions, density, pruning, props, and settings JSON copy.
- The layout stacks vertically on phones. Auto-rotation respects reduced-motion preferences.

## Rendering

ACES filmic tone mapping and sRGB base color; linear normal, roughness, and AO maps. Leaves use a non-metallic, double-sided physical material, curved instanced geometry, shared alpha-cutout depth material, and receiving/casting shadows. Bark has procedural color and small-scale bump detail. Rendering and shadow updates run on demand while the tree is stationary.

The four 256×512 leaf maps were extracted from the user's supplied showcase image, with a shared feathered albedo silhouette and individually aligned crop bounds. They are **reference-derived artistic maps**, not calibrated scans: the source silhouettes/veins do not correspond perfectly. This is a WebGL rasterized PBR preview, not a path tracer or a claim of production AAA asset quality. There is no simulated subsurface scattering, wind, or HDR environment map. Dense trees and high-resolution shadows can be slower on software WebGL or mobile devices; lower leaf density if needed.

## Offline HTML

```sh
python3 scripts/build_standalone.py
```

Creates `.hoplite/artifacts/Arboreal-Tree-Studio.html` containing the renderer, styles, code, and all four maps. Open it directly in a WebGL-capable browser; PNG export works offline. Settings copy may use a selectable JSON fallback when clipboard permission is unavailable.

## Texture regeneration

The generated PNGs are committed; Pillow is **not** needed to run or bundle the app. `scripts/prepare_leaf_textures.py` requires Python with Pillow if regenerating them:

```sh
python3 scripts/prepare_leaf_textures.py /path/to/Leaf\ Texture\ Map\ Showcase.png
```

The expected atlas size is 1536×1024. The default source path points to this task's original attachment, which is intentionally not committed.

## Checks

```sh
node --check tree.js
python3 -m py_compile scripts/build_standalone.py scripts/prepare_leaf_textures.py
python3 scripts/build_standalone.py
```

Also verify the live WebGL view, lighting and material controls, tree regeneration, texture dialogs, PNG download, and mobile layout in a browser.
