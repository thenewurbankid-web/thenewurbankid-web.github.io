// The New Urban Kid, v2: a producer's studio at night. Gear is the projects.
import * as THREE from "three";
import { byId, OWNER, WORLDS } from "./data.js";
import { buildRoom } from "./room.js";
import { Film } from "./post.js";
import { makeCanvases } from "./paper.js";
import { makeCrate } from "./crate.js";
import { makeSound } from "./sound.js";
import { makeKeys, isTyping, trapTab } from "./keys.js";

const $ = (id) => document.getElementById(id);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const phone = coarse || Math.min(screen.width, screen.height) < 820;
const SET = phone ? "sm" : "lg";
const body = document.body;

// in Tab order: the producer, then the gear left to right through the projects, then the crate
const SPOTS = {
  producer: { name: "Shashank Penumatcha", where: "At the desk" },
  orbit: { name: "Orbit", where: "On the CRT" },
  quest: { name: "A Vibe Called Quest", where: "On the turntable" },
  ruckus: { name: "Bring The Ruckus", where: "The flyer on the wall" },
  line: { name: "Line framework", where: "The MPC" },
  construct: { name: "Construct", where: "A pad on the MPC" },
  vision: { name: "Vision", where: "A pad on the MPC" },
  crate: { name: "The crate", where: "Every record, to flip through" },
};
const PAD_COLOR = { construct: "#ffc880", vision: "#5ad8ff", line: "#d8d0c4" };

// ------------------------------------------------------------------ crate (works without WebGL too)
let closeAll = () => {};
const crate = makeCrate({ reduced, onClose: () => closeAll(true) });

// ------------------------------------------------------------------ keyboard (overlay, held keys, announcements)
const keys = makeKeys({
  title: "Keys · the studio",
  rows: [
    ["Tab / Shift+Tab", "Move between the producer, the gear and the crate, then the corner links"],
    ["Enter", "Open what has focus: the camera pushes in"],
    ["Esc", "Back out: close the panel or the crate, focus returns to the gear"],
    ["← → ↑ ↓ or W A S D", "Look around the room (hold to keep moving)"],
    ["+ / −", "Step in or out"],
    ["0 or Home", "Back to the starting view"],
    ["In the crate", "← → flip records · Enter turns the sleeve · Tab reaches its links"],
    ["?", "Show or hide this list"],
  ],
  enabled: () => !body.classList.contains("open") && !body.classList.contains("browse"),
});
{ const s = $("social"); s.querySelector('[data-k="github"]').href = OWNER.github; s.querySelector('[data-k="linkedin"]').href = OWNER.linkedin; }
$("keys-btn").addEventListener("click", (e) => { e.preventDefault(); keys.toggle(); });
$("skip").addEventListener("click", (e) => { e.preventDefault(); if (typeof navigate === "function" && window.__studio) navigate("crate"); else crate.open(); });

// ------------------------------------------------------------------ renderer
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $("scene"), antialias: false, powerPreference: "high-performance" });
  if (!renderer.capabilities.isWebGL2) throw new Error("WebGL2 needed");
} catch (e) {
  body.classList.add("nogl", "browse");
  $("veil").classList.add("off");
  $("crate-back").hidden = true;
  crate.open();
  throw e;
}
renderer.setClearColor(0x000000, 1);
renderer.autoClear = true;
let dpr = Math.min(devicePixelRatio || 1, phone ? 1.5 : 2);
const film = new Film(renderer, { phone });

// ------------------------------------------------------------------ assets
const loader = new THREE.TextureLoader();
const load = (path, srgb = true) => loader.loadAsync(path).then((t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; });
const names = ["wall", "desk", "cork", "paper", "crt", "mpc", "record", "speaker", "lamp", "window", "crate", "gloves", "producer"];
const [meta, ...texList] = await Promise.all([
  fetch("assets/room/meta.json").then((r) => r.json()),
  ...names.map((n) => load(`assets/room/${SET}/${n}.webp`)),
  ...["orbit", "quest", "ruckus", "construct"].map((n) => load(`assets/previews/${n}.webp`)),
]);
const tex = Object.fromEntries(names.map((n, i) => [n, texList[i]]));
const prev = { orbit: texList[13], quest: texList[14], ruckus: texList[15], construct: texList[16] };
tex.orbit = prev.orbit;
const canvases = await makeCanvases({
  cork: tex.cork.image, paper: tex.paper.image, gloves: tex.gloves.image,
  previews: Object.fromEntries(Object.entries(prev).map(([k, t]) => [k, t.image])),
});
const room = await buildRoom({ tex, meta, canvases, reduced });
const { scene, camera, rig } = room;

// ------------------------------------------------------------------ hotspots and the label
const hotsEl = $("hots"), tagEl = $("tag");
const hots = {};
for (const id of Object.keys(SPOTS)) {
  const a = document.createElement("a");
  a.className = "hot" + (id === "construct" || id === "vision" ? " pad" : "");
  a.href = `#${id}`;
  const d = byId(id);
  a.setAttribute("aria-label", id === "crate" ? "The crate of records: browse every project" : id === "producer" ? "About Shashank Penumatcha" : `${d.name}, ${SPOTS[id].where.toLowerCase()}: ${d.pitch}`);
  a.innerHTML = `<span>${SPOTS[id].name}</span>`;
  a.addEventListener("pointerenter", (e) => { if (e.pointerType !== "touch") setHover(id); });
  a.addEventListener("pointerleave", () => setHover(null));
  a.addEventListener("focus", () => {
    setHover(id);
    if (a.matches(":focus-visible")) peek.id = id;          // keyboard focus: the camera glides to frame it
    keys.announce(`${SPOTS[id].name}. ${SPOTS[id].where}. Enter to open.`);
  });
  a.addEventListener("blur", () => { setHover(null); if (peek.id === id) peek.id = null; });
  a.addEventListener("click", (e) => { e.preventDefault(); navigate(id); });
  hotsEl.appendChild(a); hots[id] = a;
}
const state = { hover: null, open: null };
const peek = { id: null };
function setHover(id) {
  state.hover = id;
  if (id && !state.open) {
    tagEl.innerHTML = `${SPOTS[id].name}<small>${SPOTS[id].where}</small>`;
    tagEl.classList.add("on");
  } else if (!state.open || !id) tagEl.classList.remove("on");
  if (state.open === "line" && (id === "construct" || id === "vision")) {
    tagEl.innerHTML = `${SPOTS[id].name}<small>${SPOTS[id].where}</small>`; tagEl.classList.add("on");
  }
}
const v3 = new THREE.Vector3();
function prodRect(W, H) {
  if (room.objs.producer.mesh.material.uniforms.uFade.value < 0.5) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of room.corners("producer")) { v3.copy(p).project(camera); const x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * H;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}
function placeHots() {
  const W = innerWidth, H = innerHeight;
  for (const [id, a] of Object.entries(hots)) {
    const pts = room.corners(id);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) {
      v3.copy(p).project(camera);
      const x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * H;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const min = a.classList.contains("pad") ? 34 : 44;
    if (x1 - x0 < min) { const c = (x0 + x1) / 2; x0 = c - min / 2; x1 = c + min / 2; }
    if (y1 - y0 < min) { const c = (y0 + y1) / 2; y0 = c - min / 2; y1 = c + min / 2; }
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
    a.style.transform = `translate(${x0}px, ${y0}px)`; a.style.width = `${Math.max(0, x1 - x0)}px`; a.style.height = `${Math.max(0, y1 - y0)}px`;
    a.dataset.cx = (x0 + x1) / 2; a.dataset.top = y0;
    if (state.hover === id) {
      const lx = Math.min(W - 90, Math.max(90, (x0 + x1) / 2));
      let ly = Math.max(64, y0 + (id === "crate" ? 30 : -4));
      const pr = prodRect(W, H);                      // the tape label sits above the object; if he is there, put it below
      if (id !== "producer" && pr && lx > pr.x0 - 80 && lx < pr.x1 + 80 && ly > pr.y0 - 4 && ly - 44 < pr.y1) ly = Math.min(H - 20, y1 + 48);
      tagEl.style.left = `${lx}px`; tagEl.style.top = `${ly}px`;
    }
  }
}

// ------------------------------------------------------------------ the panel
const panel = $("panel");
function fillAbout() {
  $("p-kicker").textContent = "At the desk";
  $("p-name").textContent = OWNER.person;
  $("p-pitch").textContent = `${OWNER.name}. ${OWNER.line}`;
  $("p-facts").replaceChildren(Object.assign(document.createElement("li"), { textContent: OWNER.summary }));
  $("p-tags").textContent = "";
  const pads = $("p-pads"); pads.replaceChildren();
  for (const w of WORLDS) {
    const a = Object.assign(document.createElement("a"), { href: `#${w.id}`, textContent: w.name });
    a.style.setProperty("--pad-c", "#d8d0c4");
    a.addEventListener("click", (e) => { e.preventDefault(); navigate(w.id, true); });
    pads.appendChild(a);
  }
  $("p-links").replaceChildren(
    Object.assign(document.createElement("a"), { href: OWNER.github, target: "_blank", rel: "noopener noreferrer", textContent: "GitHub" }),
    Object.assign(document.createElement("a"), { href: OWNER.linkedin, target: "_blank", rel: "noopener noreferrer", textContent: "LinkedIn" }));
}
function fillPanel(id) {
  if (id === "producer") return fillAbout();
  const d = byId(id);
  $("p-kicker").textContent = SPOTS[id].where;
  $("p-name").textContent = d.name;
  $("p-pitch").textContent = d.pitch;
  $("p-facts").replaceChildren(...d.facts.map((f) => Object.assign(document.createElement("li"), { textContent: f })));
  $("p-tags").textContent = d.tags.join("  ·  ");
  const pads = $("p-pads"); pads.replaceChildren();
  if (d.moons) for (const m of d.moons) {
    const a = Object.assign(document.createElement("a"), { href: `#${m}`, textContent: `${byId(m).name} pad` });
    a.style.setProperty("--pad-c", PAD_COLOR[m]);
    a.addEventListener("click", (e) => { e.preventDefault(); navigate(m, true); });
    pads.appendChild(a);
  }
  if (d.parent) {
    const a = Object.assign(document.createElement("a"), { href: `#${d.parent}`, textContent: "Line framework, the MPC" });
    a.style.setProperty("--pad-c", PAD_COLOR.line);
    a.addEventListener("click", (e) => { e.preventDefault(); navigate(d.parent, true); });
    pads.appendChild(a);
  }
  const links = $("p-links"); links.replaceChildren();
  for (const l of d.links) {
    if (l.live === false) { links.appendChild(Object.assign(document.createElement("span"), { className: "soon", textContent: `${l.label} page coming` })); continue; }
    links.appendChild(Object.assign(document.createElement("a"), { href: l.href, target: "_blank", rel: "noopener", textContent: l.label === "Enter" ? "Enter" : l.label }));
  }
  if (d.note) links.appendChild(Object.assign(document.createElement("span"), { className: "soon", textContent: d.note }));
}
$("p-back").addEventListener("click", (e) => { e.preventDefault(); back(); });

// ------------------------------------------------------------------ camera: rest, parallax, push-in
const clock = new THREE.Clock();
const camState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50 };
const shot = { from: null, to: null, t: 1, dur: 2.1 };
const focus = { dist: 2.6, aperture: 0.9, blurAll: 0 };
const par = { x: 0, y: 0, tx: 0, ty: 0 };
// keyboard look: x/y in -1..1 (pan and look), dolly in metres along the view; eased toward targets
const look = { x: 0, y: 0, vx: 0, vy: 0, dolly: 0, tdolly: 0 };
let lastFocus = null;

const pc = new THREE.Vector3();
// the sideways/up shift that keeps the producer off a peeked object; cached per object and screen shape
const peekCache = new Map();
function peekOffset(id, pos, aim, fov) {
  const key = `${id}:${camera.aspect.toFixed(3)}`;
  if (peekCache.has(key)) return peekCache.get(key);
  if (!OCCLUDABLE.has(id)) { peekCache.set(key, { x: 0, y: 0 }); return { x: 0, y: 0 }; }
  const fwd = aim.clone().sub(pos).normalize(), right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, fwd);
  const side = Math.sign(room.center(id, v3).x - room.center("producer", new THREE.Vector3()).x) || 1;
  let best = { x: 0, y: 0 }, bestO = 2;
  for (const y of [0, 0.1, 0.2, 0.32, 0.45]) for (const x of [0, 0.1, 0.2, 0.32, 0.45, 0.6]) {
    const p = pos.clone().addScaledVector(right, x * side).addScaledVector(up, y);
    const o = occlusion(id, { pos: p, look: aim, fov });
    if (o < 0.02) { best = { x: x * side, y }; bestO = o; break; }
    if (o < bestO) { bestO = o; best = { x: x * side, y }; }
  }
  peekCache.set(key, best); return best;
}
function restShot() {
  const fwd = rig.look.clone().sub(rig.pos).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd);
  const pos = rig.pos.clone().addScaledVector(right, par.x * 0.085 + look.x * 0.2).addScaledVector(up, -par.y * 0.05 - look.y * 0.1)
    .addScaledVector(fwd, look.dolly);
  if (!reduced) pos.x += Math.sin(clock.elapsedTime * 0.11) * 0.008, pos.y += Math.sin(clock.elapsedTime * 0.07) * 0.005;
  const aim = rig.look.clone().addScaledVector(right, look.x * 0.45).addScaledVector(up, -look.y * 0.28);
  let fov = rig.fov;
  if (peek.id && !state.open) {                 // frame the focused object without pushing all the way in
    room.center(peek.id, pc);
    aim.lerp(pc, 0.5); pos.lerp(pc, 0.16); fov *= 0.9;
    const off = peekOffset(peek.id, pos, aim, fov);
    pos.addScaledVector(right, off.x).addScaledVector(up, off.y);
  }
  return { pos, look: aim, fov };
}
// ---- occlusion: the producer sits between the room camera and the desk, so every framing is checked against him
const occCam = new THREE.PerspectiveCamera(50, 1, 0.05, 30);
const OCCLUDABLE = new Set(["orbit", "quest", "line", "construct", "vision", "ruckus", "crate"]);
function screenRect(pts, cam) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, zs = 0;
  for (const p of pts) { v3.copy(p).applyMatrix4(cam.matrixWorldInverse); zs += -v3.z; v3.applyMatrix4(cam.projectionMatrix);
    x0 = Math.min(x0, v3.x); x1 = Math.max(x1, v3.x); y0 = Math.min(y0, v3.y); y1 = Math.max(y1, v3.y); }
  return { x0, y0, x1, y1, z: zs / pts.length };
}
// share of the object's on-screen box that the producer covers from this pose (0 = clear)
function occlusion(id, pose, aspect = camera.aspect) {
  if (id === "producer" || !room.objs[id]) return 0;
  occCam.fov = pose.fov; occCam.aspect = aspect; occCam.updateProjectionMatrix();
  occCam.position.copy(pose.pos); occCam.lookAt(pose.look); occCam.updateMatrixWorld();
  const o = screenRect(room.corners(id), occCam), p = screenRect(room.corners("producer"), occCam);
  if (p.z >= o.z) return 0;                                   // he is behind it
  const p0 = { x0: Math.max(-1, o.x0), x1: Math.min(1, o.x1), y0: Math.max(-1, o.y0), y1: Math.min(1, o.y1) };
  const area = Math.max(1e-6, (p0.x1 - p0.x0) * (p0.y1 - p0.y0));
  const ix = Math.max(0, Math.min(p0.x1, p.x1) - Math.max(p0.x0, p.x0)), iy = Math.max(0, Math.min(p0.y1, p.y1) - Math.max(p0.y0, p.y0));
  return (ix * iy) / area;
}
// try framings around the object (from its side of the producer first, then higher) until he is out of the way
function clearShot(id, make) {
  const c = room.center(id, new THREE.Vector3()), pc = room.center("producer", new THREE.Vector3());
  const side = Math.sign(c.x - pc.x) || 1;
  let best = null, bestO = 2;
  for (const lift of [0, 0.22, 0.45]) for (const yaw of [0, 0.3, 0.55, 0.8, -0.3, -0.55]) {
    const shot = make(yaw * side, lift); const o = occlusion(id, shot);
    if (o < 0.02) return shot;
    if (o < bestO) { bestO = o; best = shot; }
  }
  return best;
}
function objectShot(id) {
  if (OCCLUDABLE.has(id)) return clearShot(id, (yaw, lift) => objectShotAt(id, yaw, lift));
  return objectShotAt(id, 0, 0);
}
function objectShotAt(id, yaw, lift) {
  const c = room.center(id, new THREE.Vector3());
  const n = room.normal(id);
  const toRig = rig.pos.clone().sub(c).normalize();
  const dir = toRig.lerp(n, 0.55).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  dir.y += lift; dir.normalize();
  const fov = rig.fov * (camera.aspect < 1 ? 0.78 : 0.82);
  const half = THREE.MathUtils.degToRad(fov / 2);
  const r = room.size[id];
  const fit = camera.aspect < 1 ? 0.42 : 0.62;   // share of the view the object fills
  const dist = r / Math.tan(half) / fit / Math.min(1, camera.aspect < 1 ? camera.aspect * 1.6 : 1);
  const pos = c.clone().addScaledVector(dir, dist);
  const fwd = c.clone().sub(pos).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd);
  const look = c.clone();
  const span = Math.tan(half) * dist;
  if (panelSide() === "bottom") look.addScaledVector(up, -span * 0.45);   // object high, panel below
  else look.addScaledVector(right, span * camera.aspect * 0.32);           // object left, panel right
  return { pos, look, fov, focus: dist };
}
const panelSide = () => (innerWidth >= 900 && innerWidth >= innerHeight ? "right" : "bottom");
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function startShot(to, dur) {
  shot.from = { pos: camState.pos.clone(), look: camState.look.clone(), fov: camState.fov };
  shot.to = to; shot.t = 0; shot.dur = reduced ? 0.001 : dur;
}

// ------------------------------------------------------------------ open / close
let panelTimer = 0;
function open(id, viaPad) {
  if (id === "crate") return openCrate();
  const was = state.open;
  state.open = id;
  body.classList.add("open"); body.classList.toggle("open-line", id === "line" || id === "construct" || id === "vision");
  tagEl.classList.remove("on");
  lastFocus = hots[id];
  // pads stay with the MPC shot
  const shotId = id === "construct" || id === "vision" ? (viaPad || was === "line" || was === "construct" || was === "vision" ? "line" : "line") : id;
  const target = objectShot(shotId);
  if (!(viaPad && (was === "line" || was === "construct" || was === "vision"))) startShot(target, 2.2);
  focus.target = target.focus;
  clearTimeout(panelTimer);
  panel.classList.remove("in");
  const show = () => {
    fillPanel(id); panel.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add("in")));
    panel.tabIndex = -1; panel.scrollTop = 0; panel.focus({ preventScroll: true });
  };
  if (was && panel.hidden === false) { setTimeout(show, reduced ? 0 : 350); } else panelTimer = setTimeout(show, reduced ? 0 : 1300);
}
function openCrate() {
  state.open = "crate"; body.classList.add("browse"); tagEl.classList.remove("on");
  lastFocus = hots.crate;
  const s = objectShot("crate"); startShot({ ...s, look: s.look }, 1.8); focus.target = 0.4;
  setTimeout(() => crate.open(), reduced ? 0 : 700);
}
function close() {
  if (!state.open) return;
  const was = state.open;
  state.open = null; focus.target = null;
  body.classList.remove("open", "open-line", "browse");
  panel.classList.remove("in"); clearTimeout(panelTimer);
  setTimeout(() => { if (!state.open) panel.hidden = true; }, reduced ? 0 : 900);
  if (was === "crate") crate.close();
  startShot(null, 2.2);
  announceRoom();
  if (lastFocus && document.activeElement && (panel.contains(document.activeElement) || $("crate").contains(document.activeElement) || document.activeElement === panel)) lastFocus.focus({ preventScroll: true });
}
closeAll = () => back();

// history: each open is a hash, so the phone's back gesture closes it
function navigate(id, replace) {
  if (state.open === id) return;
  if (replace || state.open) history.replaceState({ id }, "", `#${id}`); else history.pushState({ id }, "", `#${id}`);
  open(id, replace);
}
function back() {
  if (!state.open) return;
  if (history.state && history.state.id) history.back();
  else { history.replaceState(null, "", location.pathname + location.search); close(); }
}
addEventListener("popstate", () => {
  const id = location.hash.slice(1);
  if (id && (byId(id) || id === "crate" || id === "producer")) open(id); else close();
});
addEventListener("keydown", (e) => {
  if (isTyping(e) || keys.overlayOpen) return;
  if (e.key === "Escape") { e.preventDefault(); back(); return; }
  if (state.open === "crate") { trapTab($("crate"), e); return; }
  if (state.open) { trapTab(panel, e); return; }
  if (keys.isAxisKey(e)) {
    e.preventDefault();
    if (reduced) { const a = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key] || { a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] }[e.key.toLowerCase()];
      look.x = THREE.MathUtils.clamp(look.x + a[0] * 0.34, -1, 1); look.y = THREE.MathUtils.clamp(look.y + a[1] * 0.34, -1, 1); }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "+" || e.key === "=") { e.preventDefault(); look.tdolly = Math.min(0.7, look.tdolly + 0.18); }
  else if (e.key === "-" || e.key === "_") { e.preventDefault(); look.tdolly = Math.max(-0.45, look.tdolly - 0.18); }
  else if (e.key === "0" || e.key === "Home") { e.preventDefault(); look.x = reduced ? 0 : look.x; look.y = reduced ? 0 : look.y; look.home = true; look.tdolly = 0; }
});
// the room announces itself when you come back to it
const announceRoom = () => keys.announce("Back in the studio.");
$("scene").addEventListener("click", () => { if (state.open) back(); });

// ------------------------------------------------------------------ parallax: mouse, or tilt on phones
addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" && !reduced) { par.tx = (e.clientX / innerWidth) * 2 - 1; par.ty = (e.clientY / innerHeight) * 2 - 1; } });
const tiltBtn = $("tilt");
let tilt0 = null, tiltOn = false;
function onTilt(e) {
  if (e.gamma == null) return;
  if (!tilt0) tilt0 = { g: e.gamma, b: e.beta };
  const c = (v) => Math.max(-1, Math.min(1, v));
  par.tx = c((e.gamma - tilt0.g) / 22); par.ty = c((e.beta - tilt0.b) / 22);
}
function setTilt(on) {
  tiltOn = on; tilt0 = null;
  if (on) addEventListener("deviceorientation", onTilt); else { removeEventListener("deviceorientation", onTilt); par.tx = par.ty = 0; }
  tiltBtn.textContent = on ? "tilt on" : "tilt off"; tiltBtn.setAttribute("aria-pressed", String(on));
}
if (coarse && !reduced && "DeviceOrientationEvent" in window) {
  tiltBtn.hidden = false;
  const needsAsk = typeof DeviceOrientationEvent.requestPermission === "function";
  if (!needsAsk) setTilt(true);
  tiltBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (tiltOn) return setTilt(false);
    if (needsAsk) { try { if ((await DeviceOrientationEvent.requestPermission()) !== "granted") return; } catch { return; } }
    setTilt(true);
  });
}

// ------------------------------------------------------------------ sound
const sound = makeSound();
$("sound").addEventListener("click", (e) => {
  e.preventDefault(); const on = sound.toggle();
  e.currentTarget.textContent = on ? "sound on" : "sound off"; e.currentTarget.setAttribute("aria-pressed", String(on));
});

// ------------------------------------------------------------------ size
function resize() {
  const W = innerWidth, H = innerHeight;
  renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
  film.setSize(W, H, dpr);
  camera.aspect = W / H;
  room.layout(camera.aspect);
  peekCache.clear();
  film.u.uMaxBlur.value = H * dpr * 0.011;
  film.u.uLeakPos.value.set(camera.aspect < 1 ? -0.05 : 0.02, camera.aspect < 1 ? 0.62 : 0.7);
  if (state.open && state.open !== "crate") { const s = objectShot(state.open === "construct" || state.open === "vision" ? "line" : state.open); shot.to = s; shot.t = 1; Object.assign(camState, { pos: s.pos.clone(), look: s.look.clone(), fov: s.fov }); }
}
addEventListener("resize", resize);
resize();
{ const r = restShot(); camState.pos.copy(r.pos); camState.look.copy(r.look); camState.fov = r.fov; }
if (!reduced) camState.pos.add(new THREE.Vector3(0, 0.12, 0.55)); // the intro: drift in slowly from the doorway

// ------------------------------------------------------------------ frame loop
let fpsT = 0, fpsN = 0, checked = false, prodFade = 1;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  // parallax eases toward the pointer or tilt
  const k = 1 - Math.exp(-dt * 2.0);
  par.x += (par.tx - par.x) * k; par.y += (par.ty - par.y) * k;
  // keyboard look: held keys drive a velocity that eases in and out, so moves start and stop softly
  if (!state.open && !reduced) {
    const ax = keys.axis(), kv = 1 - Math.exp(-dt * 3.5);
    look.vx += (ax.x * 0.75 - look.vx) * kv; look.vy += (ax.y * 0.75 - look.vy) * kv;
    look.x = THREE.MathUtils.clamp(look.x + look.vx * dt, -1, 1); look.y = THREE.MathUtils.clamp(look.y + look.vy * dt, -1, 1);
    if (look.home) { const kh = 1 - Math.exp(-dt * 2.5); look.x -= look.x * kh; look.y -= look.y * kh; if (Math.abs(look.x) + Math.abs(look.y) < 0.002) { look.x = look.y = 0; look.home = false; } if (ax.x || ax.y) look.home = false; }
  } else if (reduced && look.home) { look.home = false; }
  look.dolly += (look.tdolly - look.dolly) * (reduced ? 1 : 1 - Math.exp(-dt * 2.2));
  // camera
  if (shot.t < 1) {
    shot.t = Math.min(1, shot.t + dt / shot.dur);
    const e = ease(shot.t), to = shot.to || restShot();
    camState.pos.lerpVectors(shot.from.pos, to.pos, e);
    camState.look.lerpVectors(shot.from.look, to.look, e);
    camState.fov = THREE.MathUtils.lerp(shot.from.fov, to.fov, e);
    focus.blurAll = reduced ? 0 : Math.sin(Math.PI * e) * 2.2 * dpr;
  } else if (!state.open) {
    const r = restShot(), kk = reduced ? 1 : 1 - Math.exp(-dt * 1.1);
    camState.pos.lerp(r.pos, kk); camState.look.lerp(r.look, kk); camState.fov += (r.fov - camState.fov) * kk;
    focus.blurAll = 0;
  }
  camera.position.copy(camState.pos); camera.lookAt(camState.look);
  if (Math.abs(camera.fov - camState.fov) > 1e-4) { camera.fov = camState.fov; camera.updateProjectionMatrix(); }
  // depth of field: rest focus on the CRT, push-in focus on the object
  const restFocus = camera.position.distanceTo(room.center("orbit", v3)) * 0.74;
  const wantDist = focus.target ?? restFocus;
  const wantAp = state.open ? (state.open === "crate" ? 3.5 : 2.4) : (camera.aspect < 1 ? 0.55 : 0.8);
  const kf = 1 - Math.exp(-dt * 2.4);
  focus.dist += (wantDist - focus.dist) * kf; focus.aperture += (wantAp - focus.aperture) * kf;
  film.u.uFocus.value = focus.dist; film.u.uAperture.value = focus.aperture; film.u.uBlurAll.value = focus.blurAll;
  film.u.uTime.value = reduced ? 0 : t;
  film.u.uLeak.value = reduced ? 0.03 : 0.045 + 0.02 * Math.sin(t * 0.21);
  room.update(dt, t, state);
  {
    const target = state.open && state.open !== "producer" ? (state.open === "construct" || state.open === "vision" ? "line" : state.open) : peek.id;
    const pose = { pos: camera.position, look: camState.look, fov: camera.fov };
    const covered = target && target !== "producer" && occlusion(target, pose) > 0.02;
    const want = covered || (state.open && OCCLUDABLE.has(state.open)) ? 0.2 : 1;
    prodFade += (want - prodFade) * (reduced ? 1 : 1 - Math.exp(-dt * 2.5));
    room.objs.producer.setFade(prodFade);
  }
  placeHots();
  film.render(scene, camera);
  // step down on slow phones after the first seconds
  if (!checked) {
    fpsT += dt; fpsN++;
    if (fpsT > 3) { checked = true; if (fpsN / fpsT < 38 && dpr > 1) { dpr = 1; resize(); } }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ start
requestAnimationFrame(() => $("veil").classList.add("off"));
const hint = $("hint");
hint.textContent = coarse ? "Tilt to look · tap the gear" : "Move to look · click the gear · Tab, arrows · ? for keys";
setTimeout(() => hint.classList.add("on"), reduced ? 300 : 3200);
setTimeout(() => hint.classList.remove("on"), 11000);
const start = location.hash.slice(1);
if (start && (byId(start) || start === "crate" || start === "producer")) {
  history.replaceState(null, "", location.pathname + location.search); history.pushState({ id: start }, "", `#${start}`);
  setTimeout(() => open(start), reduced ? 0 : 900);
}
window.__studio = { state, open: navigate, back, camState, look, peek, occlusion: (id) => occlusion(state.open && (id === "construct" || id === "vision") ? "line" : id, { pos: camera.position.clone(), look: camState.look.clone(), fov: camera.fov }), get producerFade() { return prodFade; } };
