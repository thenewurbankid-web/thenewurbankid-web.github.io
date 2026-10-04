// Things printed on paper in the room, drawn once into canvases: the cork board with polaroids and the
// credit card, the Bring The Ruckus flyer, and the record label. All text uses the site's own typeface.
import * as THREE from "three";
import { OWNER } from "./data.js";

const FONT = '"Jost", "Helvetica Neue", Helvetica, Arial, sans-serif';

function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function cover(g, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
  g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}
function grain(g, w, h, amt, seed = 7) {
  const d = g.getImageData(0, 0, w, h), p = d.data; let s = seed;
  for (let i = 0; i < p.length; i += 4) { s = (s * 16807) % 2147483647; const n = ((s / 2147483647) - 0.5) * amt; p[i] += n; p[i + 1] += n; p[i + 2] += n; }
  g.putImageData(d, 0, 0);
}
function spaced(g, text, x, y, spacing) { // canvas letter-spacing, centred on x
  const align = g.textAlign; g.textAlign = "left";
  const widths = [...text].map((ch) => g.measureText(ch).width), total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let cx = x - total / 2;
  [...text].forEach((ch, i) => { g.fillText(ch, cx, y); cx += widths[i] + spacing; });
  g.textAlign = align;
}
function pin(g, x, y, col) {
  g.save(); g.fillStyle = "rgba(0,0,0,.45)"; g.beginPath(); g.ellipse(x + 4, y + 5, 9, 7, 0, 0, 7); g.fill();
  const gr = g.createRadialGradient(x - 3, y - 3, 1, x, y, 10); gr.addColorStop(0, "#fff"); gr.addColorStop(0.25, col); gr.addColorStop(1, "#200");
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.restore();
}

export async function makeCanvases(img) {
  await Promise.all(["200 60px Jost", "300 30px Jost", "400 20px Jost"].map((f) => document.fonts.load(f).catch(() => {})));

  // ---- cork board
  const [cc, g] = canvas(1024, 740);
  for (let y = 0; y < 740; y += img.cork.height) for (let x = 0; x < 1024; x += img.cork.width) g.drawImage(img.cork, x, y);
  g.fillStyle = "rgba(20,10,4,.35)"; g.fillRect(0, 0, 1024, 740);
  g.strokeStyle = "#2a1c12"; g.lineWidth = 22; g.strokeRect(11, 11, 1002, 718);
  g.strokeStyle = "rgba(255,230,200,.08)"; g.lineWidth = 2; g.strokeRect(23, 23, 978, 694);
  const polas = [
    ["orbit", "Orbit", 70, 70, -0.07], ["quest", "A Vibe Called Quest", 330, 52, 0.05],
    ["ruckus", "Bring The Ruckus", 600, 84, -0.035], ["construct", "Line framework", 170, 395, 0.06],
  ];
  for (const [id, name, x, y, r] of polas) {
    g.save(); g.translate(x + 120, y + 140); g.rotate(r);
    g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 18; g.shadowOffsetX = 6; g.shadowOffsetY = 9;
    g.fillStyle = "#e9e4da"; g.fillRect(-120, -140, 240, 290); g.shadowColor = "transparent";
    g.drawImage(img.paper, -120, -140, 240, 290); g.globalCompositeOperation = "multiply"; g.fillStyle = "#e9e1d2"; g.fillRect(-120, -140, 240, 290);
    g.globalCompositeOperation = "source-over";
    cover(g, img.previews[id], -104, -124, 208, 208);
    g.fillStyle = "rgba(255,190,120,.08)"; g.fillRect(-104, -124, 208, 208); // faded print
    g.fillStyle = "#26221c"; g.font = `300 21px ${FONT}`; g.textAlign = "center"; g.fillText(name, 0, 122);
    g.restore();
    pin(g, x + 120 + Math.sin(r) * 120, y + 12, ["#b31", "#c82", "#2a6", "#36b"][polas.findIndex((p) => p[0] === id)]);
  }
  // the credit card: The New Urban Kid · Shashank Penumatcha
  g.save(); g.translate(720, 560); g.rotate(-0.025);
  g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 14; g.shadowOffsetX = 5; g.shadowOffsetY = 7;
  g.fillStyle = "#f1ece2"; g.fillRect(-190, -92, 380, 184); g.shadowColor = "transparent";
  g.globalAlpha = 0.5; g.drawImage(img.paper, -190, -92, 380, 184); g.globalAlpha = 1;
  g.strokeStyle = "rgba(190,60,50,.5)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-190, -52); g.lineTo(190, -52); g.stroke();
  g.strokeStyle = "rgba(60,110,190,.22)"; g.lineWidth = 1;
  for (let ly = -22; ly < 92; ly += 30) { g.beginPath(); g.moveTo(-190, ly); g.lineTo(190, ly); g.stroke(); }
  g.fillStyle = "#1d1a16"; g.textAlign = "center";
  g.font = `300 34px ${FONT}`; spaced(g, OWNER.name.toUpperCase(), 0, -2, 5);
  g.font = `300 25px ${FONT}`; g.fillStyle = "#3a352e"; spaced(g, OWNER.person, 0, 46, 2.5);
  g.restore();
  pin(g, 720, 474, "#ddd");
  grain(g, 1024, 740, 14);

  // ---- the flyer: a photo panel up top, white type on black below
  const [fc, f] = canvas(512, 704);
  f.fillStyle = "#070707"; f.fillRect(0, 0, 512, 704);
  f.save(); f.filter = "grayscale(1) contrast(1.25) brightness(1.25)"; cover(f, img.gloves, 26, 26, 460, 330); f.restore();
  const vg = f.createLinearGradient(0, 260, 0, 360); vg.addColorStop(0, "rgba(7,7,7,0)"); vg.addColorStop(1, "rgba(7,7,7,1)");
  f.fillStyle = vg; f.fillRect(26, 260, 460, 100);
  f.fillStyle = "#f4f2ee"; f.textAlign = "center";
  f.font = `200 62px ${FONT}`; spaced(f, "BRING", 256, 432, 14);
  f.font = `200 62px ${FONT}`; spaced(f, "THE RUCKUS", 256, 502, 9);
  f.fillStyle = "rgba(244,242,238,.4)"; f.fillRect(176, 532, 160, 1);
  f.fillStyle = "rgba(244,242,238,.82)"; f.font = `300 20px ${FONT}`;
  spaced(f, "STREET BOXING · PHONE FIRST", 256, 576, 3.2);
  f.fillStyle = "rgba(244,242,238,.55)"; f.font = `300 17px ${FONT}`;
  spaced(f, "street courts by day and night", 256, 612, 1.4);
  grain(f, 512, 704, 26, 11);
  // tape on the top corners
  f.fillStyle = "rgba(225,214,190,.55)";
  for (const [x, r] of [[40, -0.6], [472, 0.6]]) { f.save(); f.translate(x, 14); f.rotate(r); f.fillRect(-36, -11, 72, 22); f.restore(); }

  // ---- record label: A Vibe Called Quest
  const [lc, l] = canvas(512, 512);
  l.save(); l.beginPath(); l.arc(256, 256, 256, 0, 7); l.clip();
  cover(l, img.previews.quest, 0, 0, 512, 512);
  const rg = l.createRadialGradient(256, 256, 120, 256, 256, 256); rg.addColorStop(0, "rgba(0,0,0,0)"); rg.addColorStop(1, "rgba(0,0,0,.7)");
  l.fillStyle = rg; l.fillRect(0, 0, 512, 512);
  l.fillStyle = "#f4f2ee"; l.font = `300 30px ${FONT}`; l.textAlign = "center"; l.textBaseline = "middle";
  const ring = "A VIBE CALLED QUEST  ·  SIDE A";
  const step = 0.105; let a = -Math.PI / 2 - (ring.length - 1) * step / 2;
  for (const ch of ring) { l.save(); l.translate(256 + Math.cos(a) * 214, 256 + Math.sin(a) * 214); l.rotate(a + Math.PI / 2); l.fillText(ch, 0, 0); l.restore(); a += step; }
  l.fillStyle = "#050505"; l.beginPath(); l.arc(256, 256, 12, 0, 7); l.fill();
  l.restore();

  return { cork: tex(cc), flyer: tex(fc), label: tex(lc) };
}
