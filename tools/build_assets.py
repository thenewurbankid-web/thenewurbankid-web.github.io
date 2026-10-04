"""Builds the v2 studio textures from the downloaded source photos.

Usage: python3 tools/build_assets.py <raw_dir> <acg_dir>
Needs Pillow, numpy and scipy. Sources and licences: assets/CREDITS.md.
Writes assets/room/lg/*.webp (desktop) and assets/room/sm/*.webp (phones, <= 1024 px).
"""
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps
from scipy import ndimage

RAW, ACG = sys.argv[1], sys.argv[2]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "room")
META = {}

def save(name, im, lg, sm, q=80):
    for sub, w in (("lg", lg), ("sm", sm)):
        os.makedirs(os.path.join(ROOT, sub), exist_ok=True)
        out = im.copy()
        if out.width > w or out.height > w:
            out.thumbnail((w, w), Image.LANCZOS)
        out.save(os.path.join(ROOT, sub, name + ".webp"), "WEBP", quality=q, method=6)

def feather_poly(size, pts, r):
    m = Image.new("L", size, 0); ImageDraw.Draw(m).polygon(pts, fill=255)
    return m.filter(ImageFilter.GaussianBlur(r))

def scrub(im, box, r=28):
    """Blur a rectangle (brand names) and put matching grain back."""
    reg = im.crop(box)
    bl = reg.filter(ImageFilter.GaussianBlur(r))
    a = np.asarray(bl).astype(np.float32)
    a += np.random.default_rng(1).normal(0, 4, a.shape)
    im.paste(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), box[:2])

# ---- CRT television (CC BY 2.0, Matthew Paul Argall) -------------------------------
crt = Image.open(f"{RAW}/crt.jpg").convert("RGB")
body = [(451,286),(601,263),(902,225),(1217,225),(1563,300),(1581,346),(1578,887),(1397,935),(706,1109),(669,1089),(496,917),(445,376)]
antenna = [(601,195),(1142,210),(1157,263),(608,225)]
mask = Image.new("L", crt.size, 0); d = ImageDraw.Draw(mask); d.polygon(body, fill=255); d.polygon(antenna, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(3))
# glass: hand-traced outline of the curved screen
gpts = [(808,503),(1075,470),(1345,458),(1352,670),(1300,879),(1040,928),(778,962),(784,730)]
glass = np.asarray(feather_poly(crt.size, gpts, 0)) > 0
pick = {"tl": 0, "tr": 2, "br": 4, "bl": 6}
crop = (440, 185, 1590, 1115)
cw, ch = crop[2] - crop[0], crop[3] - crop[1]
META["crtScreen"] = {k: [round((gpts[i][0] - crop[0]) / cw, 4), round(1 - (gpts[i][1] - crop[1]) / ch, 4)] for k, i in pick.items()}
a = np.asarray(crt).astype(np.float32)
gl = ndimage.gaussian_filter(glass.astype(np.float32), 2)[..., None]
a = a * (1 - gl) + a * 0.10 * gl          # dark glass, the screen glow is drawn on top in WebGL
out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
scrub(out, (1150, 1010, 1330, 1060), 6)    # maker's name under the screen
out.putalpha(mask)
save("crt", out.crop(crop), 1400, 900)

# ---- MPC 3000 (CC0, Smithsonian NMAAHC) --------------------------------------------
mpc = Image.open(f"{RAW}/mpc.jpg").convert("RGB")
for box in [(165, 95, 1045, 210), (505, 238, 1120, 300)]:   # maker, signature, badge, model name
    scrub(mpc, box)
crop = (48, 44, 2004, 1930)
mw, mh = crop[2] - crop[0], crop[3] - crop[1]
cols = [(400, 536), (565, 703), (734, 872), (899, 1039)]
rows = [(820, 977), (988, 1142), (1153, 1307), (1318, 1474)]
pads = []
for r, (y0, y1) in enumerate(rows):
    for col, (x0, x1) in enumerate(cols):
        pads.append([round((x0 - crop[0]) / mw, 4), round(1 - (y1 - crop[1]) / mh, 4), round((x1 - x0) / mw, 4), round((y1 - y0) / mh, 4)])
META["mpcPads"] = pads    # [u0, v0, w, h], row 0 = top row of pads
META["mpcScreen"] = [round((300 - crop[0]) / mw, 4), round(1 - (510 - crop[1]) / mh, 4), round((965 - 300) / mw, 4), round((510 - 330) / mh, 4)]
m = mpc.crop(crop)
al = Image.new("L", m.size, 0); ImageDraw.Draw(al).rounded_rectangle((6, 6, m.width - 6, m.height - 6), 26, fill=255)
m.putalpha(al.filter(ImageFilter.GaussianBlur(2)))
save("mpc", m, 1400, 1000)

# ---- Vinyl record (public domain, Evan-Amos): concentric grooves from the photo ----
rec = np.asarray(Image.open(f"{RAW}/record.jpg").convert("L")).astype(np.float32)
cx, cy, rx, ry = 1913, 1930, 1617, 1658
N = 1024
yy, xx = np.mgrid[0:N, 0:N]
u, v = (xx + 0.5) / N * 2 - 1, (yy + 0.5) / N * 2 - 1
rr = np.sqrt(u * u + v * v)
# radial profile = median luminance per radius ring of the photo (removes the baked highlights)
sy, sx = np.mgrid[0:rec.shape[0]:2, 0:rec.shape[1]:2]
sr = np.sqrt(((sx - cx) / rx) ** 2 + ((sy - cy) / ry) ** 2)
bins = np.clip((sr * 900).astype(int), 0, 1000)
vals = rec[sy, sx]
prof = np.zeros(1001)
for b in range(0, 901):
    sel = vals[bins == b]
    prof[b] = np.percentile(sel, 30) if sel.size else 0
ring = prof[np.clip((rr * 900).astype(int), 0, 1000)]
# keep a little of the photo's own texture for life
px = np.clip((cx + u * rx).astype(int), 0, rec.shape[1] - 1); py = np.clip((cy + v * ry).astype(int), 0, rec.shape[0] - 1)
photo = rec[py, px]
lum = ring * 0.8 + np.minimum(photo, ring + 25) * 0.2
lum = np.clip((lum - 4) * 1.9, 0, 255)
alpha = np.clip((1 - rr) * N * 0.5, 0, 1) * 255
label = rr < 0.345
alpha[label] = 0                               # the label is painted per project in WebGL
img = np.dstack([lum, lum, lum * 1.02, alpha]).clip(0, 255).astype(np.uint8)
save("record", Image.fromarray(img, "RGBA"), 1024, 768)
META["recordLabel"] = 0.345

# ---- Studio monitor speaker (CC BY 2.0, Tim Sheerman-Chase): crop above the logo ---
sp = Image.open(f"{RAW}/speaker.jpg").convert("RGB").crop((60, 0, 3456, 4700))
sp = ImageOps.autocontrast(sp, cutoff=0.5)
save("speaker", sp, 720, 460)

# ---- Lamp and books (CC0, Jez Timms): alpha from light, the room is black anyway ---
lp = Image.open(f"{RAW}/lamp.jpg").convert("RGB").crop((0, 330, 2800, 1880))
l = np.asarray(lp).astype(np.float32); lu = l.max(axis=2)
al = np.clip((lu - 3) / 16, 0, 1)
al = ndimage.gaussian_filter(al, 3)
edge = np.ones_like(al)
h, w = al.shape; e = 60
edge *= np.clip(np.minimum.reduce([np.arange(w)[None, :] / e + 0 * al, (w - 1 - np.arange(w))[None, :] / e + 0 * al,
                                   np.arange(h)[:, None] / e + 0 * al, (h - 1 - np.arange(h))[:, None] / e + 0 * al]), 0, 1)
lp.putalpha(Image.fromarray((al * edge * 255).astype(np.uint8)))
save("lamp", lp, 1600, 1000)
META["lampBulb"] = [round(2443 / 2800, 4), round(1 - (1047 - 330) / 1550, 4)]

# ---- City night bokeh for the window (CC0, Pixel.la) --------------------------------
bk = Image.open(f"{RAW}/bokeh.jpg").convert("RGB").crop((500, 300, 3840, 2560))
save("window", bk, 1200, 800, q=72)

# ---- Record bins for the crate (CC0, Fabien Barral) ---------------------------------
cr = Image.open(f"{RAW}/crate.jpg").convert("RGB").crop((1200, 760, 3500, 2550))
save("crate", cr, 1200, 800, q=74)

# ---- Boxing gloves for the flyer (public domain, US Air Force) ----------------------
gv = ImageOps.grayscale(Image.open(f"{RAW}/glove.jpg").convert("RGB"))
gv = ImageOps.autocontrast(gv, cutoff=2)
gv = gv.point(lambda x: int(255 * (x / 255) ** 1.6))
save("gloves", gv, 900, 600)

# ---- ambientCG CC0 materials ---------------------------------------------------------
for name, src, lg, sm in [("wall", "Plaster001", 1024, 512), ("desk", "Wood051", 1024, 512),
                          ("cork", "Cork002", 512, 512), ("paper", "Paper001", 512, 512)]:
    im = Image.open(f"{ACG}/{src}/{src}_1K-JPG_Color.jpg").convert("RGB")
    save(name, im, lg, sm, q=74)

json.dump(META, open(os.path.join(ROOT, "meta.json"), "w"), indent=1)
print(json.dumps(META))
