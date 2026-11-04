"""Bake real Aurès elevation into the mountain level's heightmaps.

Source: AWS Terrain Tiles (Terrarium encoding, public dataset derived from SRTM and other open DEMs —
https://registry.opendata.aws/terrain-tiles/). Google Earth terrain cannot be exported/baked under its
terms, so the level uses this open SRTM-derived data for the same real place.

Run:  uv run --with pillow --with numpy scripts/fetch_dem.py
Writes frontend/public/terrain/aures-{near,far}.bin (uint16 LE, decimetres above `min`) + aures.json.
"""
import json, math, os, urllib.request
import numpy as np
from PIL import Image

CENTER = (35.35098, 6.97623)  # slope west of Khenchela chosen by template search (60 m rise S→N over 180 m)
OUT = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "terrain")
CACHE = "/tmp/terrarium-cache"
LAYERS = {"near": dict(zoom=15, n=401, spacing=4.0), "far": dict(zoom=10, n=401, spacing=128.0)}

def tile(z, x, y):
    os.makedirs(CACHE, exist_ok=True)
    p = f"{CACHE}/{z}_{x}_{y}.png"
    if not os.path.exists(p):
        urllib.request.urlretrieve(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", p)
    a = np.asarray(Image.open(p).convert("RGB")).astype(np.float64)
    return a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768

def sampler(zoom):
    cache = {}
    def h(lat, lon):
        n = 2 ** zoom
        fx = (lon + 180) / 360 * n * 256
        fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n * 256
        x0, y0 = math.floor(fx - 0.5), math.floor(fy - 0.5)
        tx, ty = (fx - 0.5) - x0, (fy - 0.5) - y0
        def px(X, Y):
            key = (X // 256, Y // 256)
            if key not in cache: cache[key] = tile(zoom, *key)
            return cache[key][Y % 256, X % 256]
        a, b, c, d = px(x0, y0), px(x0 + 1, y0), px(x0, y0 + 1), px(x0 + 1, y0 + 1)
        return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
    return h

def blur(g, sigma):
    r = int(sigma * 3)
    k = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * sigma * sigma))
    k /= k.sum()
    p = np.pad(g, r, mode="edge")
    p = np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 1, p)
    return np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 0, p)

def main():
    lat0, lon0 = CENTER
    mlat = 111320.0
    mlon = 111320.0 * math.cos(math.radians(lat0))
    meta = {"center": CENTER, "source": "AWS Terrain Tiles (Terrarium), SRTM-derived", "layers": {}}
    for name, L in LAYERS.items():
        n, s, h = L["n"], L["spacing"], sampler(L["zoom"])
        half = (n - 1) / 2 * s
        grid = np.zeros((n, n))
        for j in range(n):          # row 0 = north (world -z)
            z = -half + j * s
            lat = lat0 - z / mlat
            for i in range(n):      # column 0 = west (world -x)
                x = -half + i * s
                grid[j, i] = h(lat, lon0 + x / mlon)
        if name == "near":
            grid = blur(grid, 1.5)  # SRTM is 30 m: remove the bilinear facets of the z15 upsampling
        lo = float(np.floor(grid.min()))
        q = np.clip(np.round((grid - lo) * 10), 0, 65535).astype("<u2")
        q.tofile(os.path.join(OUT, f"aures-{name}.bin"))
        meta["layers"][name] = {"n": n, "spacing": s, "min": lo, "scale": 0.1, "zoom": L["zoom"], "max": float(grid.max())}
        print(name, n, s, "elev", lo, grid.max())
    json.dump(meta, open(os.path.join(OUT, "aures.json"), "w"), indent=1)

if __name__ == "__main__":
    main()
