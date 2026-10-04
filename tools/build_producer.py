"""Builds the producer cut-out (assets/room/{lg,sm}/producer.webp) from the source photo.

Usage: python3 tools/build_producer.py   (reads assets/src/pexels-18708554.jpeg, which is not committed)
Needs Pillow, numpy, scipy and rembg (isnet-general-use model). Source and licence: assets/CREDITS.md.
Edits: the white script on the cap and the logo on the back of the shirt painted out to plain black, keeping the
fabric texture; the gold chain toned down; matte with rembg + alpha matting; cropped; resized.
"""
import os, json
import numpy as np
from PIL import Image
from scipy import ndimage
from rembg import remove, new_session

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "assets", "room")
src = Image.open(os.path.join(HERE, "..", "assets", "src", "pexels-18708554.jpeg")).convert("RGB")
a = np.asarray(src).astype(np.float32)
H, W = a.shape[:2]
L = a.mean(axis=2)
# matte first, on the untouched photo, so the paint-out can stay inside the person
matte = remove(src, session=new_session("isnet-general-use"), alpha_matting=True, alpha_matting_foreground_threshold=240,
               alpha_matting_background_threshold=15, alpha_matting_erode_size=10)
alpha = np.asarray(matte)[..., 3].astype(np.float32)
inside = ndimage.binary_erosion(alpha > 128, iterations=3)
yy, xx = np.mgrid[0:H, 0:W]

def paint_out(box, thresh, shift):
    """Fill bright marks inside box with the surrounding dark fabric, then put back texture from `shift` away."""
    global a
    x0, y0, x1, y1 = box
    inbox = (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
    m = inbox & (L > thresh) & inside
    m = ndimage.binary_dilation(m, iterations=9)
    mf = ndimage.gaussian_filter(m.astype(np.float32), 2.0)
    keep = (1 - m.astype(np.float32))[..., None]
    fill = ndimage.gaussian_filter(a * keep, (18, 18, 0)) / np.maximum(ndimage.gaussian_filter(keep, (18, 18, 0)), 1e-3)
    ring = ndimage.binary_dilation(m, iterations=30) & ~ndimage.binary_dilation(m, iterations=10) & inside
    fill = np.minimum(fill, a[ring].mean(axis=0) * 1.02)      # no halo from the old print
    dx, dy = shift
    donor = np.roll(np.roll(a, dy, axis=0), dx, axis=1)
    tex = donor - ndimage.gaussian_filter(donor, (6, 6, 0))
    mf *= inside
    a = a * (1 - mf[..., None]) + (fill + tex) * mf[..., None]

paint_out((930, 540, 1380, 740), 70, (0, -170))      # "high fashion" on the cap (corduroy above it as donor)
paint_out((990, 1380, 1290, 1700), 60, (-330, 0))    # "hf" on the back of the shirt
# the last letter sits on the cap's edge: darken whatever light is left there, inside the matte
edge = (xx > 1300) & (xx < 1385) & (yy > 560) & (yy < 720) & (alpha > 20) & (a.mean(axis=2) > 45)
em = ndimage.gaussian_filter(ndimage.binary_dilation(edge, iterations=3).astype(np.float32), 1.5)[..., None]
a = a * (1 - em) + np.array([14, 15, 20], np.float32) * em
# the chain: keep it, but take the glare down
r, g, b = a[..., 0], a[..., 1], a[..., 2]
chain = (yy > 1140) & (yy < 1225) & (xx > 870) & (xx < 1350) & (r > b + 18) & (r + g + b > 200)
cm = ndimage.gaussian_filter(ndimage.binary_dilation(chain, iterations=2).astype(np.float32), 1.5)[..., None]
a = a * (1 - cm * 0.45)
# decontaminate the edges: the wall behind him was light, so pull edge colour in from the opaque interior
inner = (alpha > 250).astype(np.float32)[..., None]
ext = ndimage.gaussian_filter(a * inner, (6, 6, 0)) / np.maximum(ndimage.gaussian_filter(inner, (6, 6, 0)), 1e-3)
edge_w = np.clip((250 - alpha) / 120, 0, 1)[..., None] * (ndimage.gaussian_filter(inner, (6, 6, 0)) > 0.02)
a = a * (1 - edge_w) + ext * edge_w
cut = Image.fromarray(np.dstack([np.clip(a, 0, 255), alpha]).astype(np.uint8), "RGBA").crop((0, 120, W, H))
bx0, by0, bx1, by1 = cut.getbbox()
cut = cut.crop((bx0, by0, bx1, cut.height))
for sub, size in (("lg", 1100), ("sm", 800)):
    o = cut.copy(); o.thumbnail((size, size), Image.LANCZOS)
    o.save(os.path.join(ROOT, sub, "producer.webp"), "WEBP", quality=82, method=6)
ch = cut.height
meta_p = os.path.join(ROOT, "meta.json"); meta = json.load(open(meta_p))
# neck line: where the collar is, about y=1215 in the source
meta["producer"] = {"neckV": round(1 - (1215 - 120 - by0) / ch, 4), "aspect": round(cut.width / ch, 4)}
json.dump(meta, open(meta_p, "w"), indent=1)
print(meta["producer"], cut.size)
