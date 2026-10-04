"""Builds the boombox and cassette textures for the song showcase.

Usage: python3 tools/build_song_assets.py <raw_dir>   (<raw_dir>/boombox.jpg, <raw_dir>/cassette.jpg: the Commons originals)
Needs Pillow, numpy, scipy. Sources and licences: assets/CREDITS.md.
"""
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

RAW = sys.argv[1]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "room")

def save(name, im, lg, sm, q=80):
    for sub, w in (("lg", lg), ("sm", sm)):
        o = im.copy(); o.thumbnail((w, w), Image.LANCZOS)
        o.save(os.path.join(ROOT, sub, name + ".webp"), "WEBP", quality=q, method=6)

def scrub(im, box, r=10):
    reg = im.crop(box).filter(ImageFilter.GaussianBlur(r))
    a = np.asarray(reg).astype(np.float32); a += np.random.default_rng(3).normal(0, 3, a.shape)
    im.paste(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), box[:2])

meta_p = os.path.join(ROOT, "meta.json"); meta = json.load(open(meta_p))

# ---- boombox (Philips D8444, CC0): brand badge and maker name blurred, yellow backdrop removed
bb = Image.open(f"{RAW}/boombox.jpg").convert("RGB")
W0, H0 = bb.size                      # 3840 x 2390 (Commons 2400 px-wide request returns the full 3840)
for box in [(420, 105, 730, 225), (3380, 175, 3740, 280)]:
    scrub(bb, box, 16)
scrub(bb, (1790, 1320, 2060, 1580), 7)      # maker's mark on the centre dome
scrub(bb, (260, 370, 1000, 660), 6)        # the tape's own label inside the door
a = np.asarray(bb).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
yellow = (r > 150) & (g > 150) & (b < 0.78 * g) & (np.abs(r - g) < 45)
lab, n = ndimage.label(yellow)
edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(edge_labels))
bg = ndimage.binary_closing(bg, iterations=3)
alpha = ndimage.gaussian_filter((~bg).astype(np.float32), 1.5)
bbA = Image.fromarray(np.dstack([a, alpha * 255]).clip(0, 255).astype(np.uint8), "RGBA")
x0, y0, x1, y1 = bbA.getbbox()
bbA = bbA.crop((x0, y0, x1, y1)); cw, ch = bbA.size
U = lambda x: round((x - x0) / cw, 4); V = lambda y: round(1 - (y - y0) / ch, 4)   # uv with v up
meta["boombox"] = {
    "aspect": round(cw / ch, 4),
    "cones": [[U(590), V(1590), round(520 / cw, 4)], [U(1925), V(1450), round(640 / cw, 4)], [U(3080), V(1590), round(520 / cw, 4)]],
    "door": [U(215), V(610), U(1000), V(300)],          # u0, v0, u1, v1 of the tape window
    "play": [U(560), V(80), U(660), V(40)],             # the play key on the top edge
}
save("boombox", bbA, 1400, 900, q=78)

# ---- cassette (Namroud Gorguis via Unsplash, CC0): cut out; the blank label is written on in the browser
cs = Image.open(f"{RAW}/cassette.jpg").convert("RGB").crop((1195, 815, 2495, 1648))
m = Image.new("L", cs.size, 0); ImageDraw.Draw(m).rounded_rectangle((8, 6, cs.width - 8, cs.height - 6), 24, fill=255)
cs.putalpha(m.filter(ImageFilter.GaussianBlur(1.2)))
cw2, ch2 = cs.size
meta["cassette"] = {
    "aspect": round(cw2 / ch2, 4),
    # label bands in uv (v up): above the window and below it
    "top": [round((1290 - 1195) / cw2, 4), round(1 - (1070 - 815) / ch2, 4), round((2440 - 1195) / cw2, 4), round(1 - (890 - 815) / ch2, 4)],
    "bottom": [round((1300 - 1195) / cw2, 4), round(1 - (1440 - 815) / ch2, 4), round((2440 - 1195) / cw2, 4), round(1 - (1300 - 815) / ch2, 4)],
}
save("cassette", cs, 720, 480, q=80)
json.dump(meta, open(meta_p, "w"), indent=1)
print(meta["boombox"], meta["cassette"])
