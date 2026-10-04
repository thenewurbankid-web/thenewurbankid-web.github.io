"""Builds the producer cut-out (assets/room/{lg,sm}/producer.webp) from the source photo.

Usage: python3 tools/build_producer.py <raw_dir>   (<raw_dir>/producer.jpg is the Commons original, 3840 px wide)
Needs Pillow, numpy, scipy and rembg (isnet-general-use model). Source and licence: assets/CREDITS.md.
Edits: matte with rembg + alpha matting; the backpack hidden by mirroring the left half of the back onto the
right below the collar; the jacket darkened to black with its quilting softened; the two sleeve badges blurred.
"""
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage
from rembg import remove, new_session

RAW = sys.argv[1]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "room")
src = Image.open(f"{RAW}/producer.jpg").convert("RGB")
crop = src.crop((1900, 500, 3840, 2497))
cut = remove(crop, session=new_session("isnet-general-use"), alpha_matting=True,
             alpha_matting_foreground_threshold=240, alpha_matting_background_threshold=12, alpha_matting_erode_size=8)
im = np.asarray(cut.convert("RGBA")).astype(np.float32)
H, W = im.shape[:2]
k = W / 680                       # measurements below were taken on a 680 px wide preview
spine = int(245 * k)
yy, xx = np.mgrid[0:H, 0:W]
mir = im[yy, np.clip(2 * spine - xx, 0, W - 1)]
m = np.clip((xx - (spine + 30 * k)) / (25 * k), 0, 1) * np.clip((yy - 318 * k) / (30 * k), 0, 1)
m = np.maximum(m, np.clip((xx - (spine + 95 * k)) / (20 * k), 0, 1) * np.clip((yy - 285 * k) / (20 * k), 0, 1))
o = im * (1 - m[..., None]) + mir * m[..., None]
rgb, a = o[..., :3], o[..., 3]
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
skin = ndimage.gaussian_filter((((r - b) > 14) & (r > g) & (yy < 330 * k)).astype(np.float32), 4 * k)
jacket = np.clip((yy - 255 * k) / (10 * k), 0, 1) * (1 - np.clip(skin * 2, 0, 1))
L = rgb.mean(axis=2)
low = ndimage.gaussian_filter(L, 7 * k)
newL = np.clip(low * 0.42 + (L - low) * 0.2, 0, 255)
cool = np.stack([newL * 0.96, newL * 0.97, newL * 1.02], -1)
rgb = rgb * (1 - jacket[..., None]) + cool * jacket[..., None]
for cx in (int(68 * k), 2 * spine - int(68 * k)):
    cy, r0 = int(588 * k), int(22 * k)
    d = np.exp(-(((xx - cx) / r0) ** 2 + ((yy - cy) / (r0 * 0.6)) ** 2))[..., None]
    rgb = rgb * (1 - d) + ndimage.gaussian_filter(rgb, (10 * k, 10 * k, 0)) * d
out = Image.fromarray(np.dstack([rgb, a]).clip(0, 255).astype(np.uint8), "RGBA")
x0, y0, x1, y1 = out.getbbox()
out = out.crop((x0, 0, x1, H))
for sub, size in (("lg", 1100), ("sm", 760)):
    o2 = out.copy(); o2.thumbnail((size, size), Image.LANCZOS)
    o2.save(os.path.join(ROOT, sub, "producer.webp"), "WEBP", quality=82, method=6)
meta_p = os.path.join(ROOT, "meta.json"); meta = json.load(open(meta_p))
meta["producer"] = {"neckV": round(1 - 262 * k / H, 4), "spineU": round((spine - x0) / (x1 - x0), 4),
                    "headTopV": round(1 - 40 * k / H, 4), "aspect": round((x1 - x0) / H, 4)}
json.dump(meta, open(meta_p, "w"), indent=1)
print(meta["producer"], out.size)
