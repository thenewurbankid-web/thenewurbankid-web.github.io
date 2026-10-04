import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { WORLDS, MOONS, OWNER, byId } from "./data.js";
import * as S from "./shaders.js";

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;

// ---------------------------------------------------------------- plain list mode
function showList(on) { document.body.classList.toggle("list", on); }
if (params.has("list")) showList(true);
$("list-close").addEventListener("click", (e) => { if (!params.has("list")) { e.preventDefault(); showList(false); } });
{ // long-press the top-left corner toggles the plain list
  let t = 0;
  addEventListener("pointerdown", (e) => { if (e.clientX < 72 && e.clientY < 72) t = setTimeout(() => showList(!document.body.classList.contains("list")), 650); }, true);
  for (const ev of ["pointerup", "pointercancel", "pointermove"]) addEventListener(ev, (e) => { if (ev !== "pointermove" || Math.hypot(e.movementX, e.movementY) > 4) clearTimeout(t); }, true);
}
if (!params.has("list")) start().catch((err) => { console.warn("WebGL scene unavailable, showing the list.", err); showList(true); });

async function start() {
  // ---------------------------------------------------------------- renderer and quality tier
  const canvas = $("scene");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", alpha: false });
  const gl = renderer.getContext();
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
  const weak = /SwiftShader|llvmpipe|Software|Mali-[4T]|Mali-G[357]\d|Adreno \(TM\) [3-5]\d\d|PowerVR|HD Graphics [2-5]\d{2,3}/i.test(gpu)
    || (navigator.deviceMemory && navigator.deviceMemory <= 2);
  let tier = params.get("q") || (weak ? "low" : coarse ? "mid" : "high");
  const Q = {
    high: { dpr: Math.min(devicePixelRatio, 2), bloom: true, stars: 1, bake: 2048, seg: 128 },
    mid: { dpr: Math.min(devicePixelRatio, 2), bloom: true, stars: 0.7, bake: 2048, seg: 96 },
    low: { dpr: 1, bloom: false, stars: 0.45, bake: 1024, seg: 64 },
  }[tier] || { dpr: 1, bloom: false, stars: 0.45, bake: 1024, seg: 64 };
  let dpr = Q.dpr;
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 4000);
  scene.add(camera);

  // ---------------------------------------------------------------- bake helpers
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quadScene.add(quad);
  function bake(fragmentShader, uniforms, w, h, type = THREE.HalfFloatType) {
    const rt = new THREE.WebGLRenderTarget(w, h, { type, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping });
    quad.material = new THREE.ShaderMaterial({ vertexShader: S.QUAD_VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });
    renderer.setRenderTarget(rt); renderer.render(quadScene, quadCam); renderer.setRenderTarget(null);
    quad.material.dispose();
    return rt.texture;
  }
  const LOOK = { ocean: 0, violet: 1, ember: 2, ice: 3, rock: 4, moon: 5 };
  function bakeSurface(look, seed) {
    const w = look === "ice" ? Math.min(Q.bake, 1024) : Q.bake, h = w / 2;
    const u = (pass) => ({ uLook: { value: LOOK[look] }, uPass: { value: pass }, uSeed: { value: seed } });
    return { alb: bake(S.BAKE_FRAG, u(0), w, h), mask: bake(S.BAKE_FRAG, u(1), w, h), w, h };
  }

  // ---------------------------------------------------------------- sky: nebula then three star layers
  const nebTex = bake(S.NEBULA_BAKE_FRAG, {}, tier === "high" ? 4096 : Q.bake, tier === "high" ? 2048 : Q.bake / 2, THREE.UnsignedByteType);
  const nebula = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), new THREE.ShaderMaterial({
    vertexShader: S.NEBULA_VERT, fragmentShader: S.NEBULA_FRAG, side: THREE.BackSide, depthWrite: false,
    uniforms: { tNeb: { value: nebTex }, uFlashDir: { value: new THREE.Vector3(1, 0, 0) }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(0.75, 0.62, 1.0) } },
  }));
  nebula.renderOrder = -10; nebula.frustumCulled = false;
  scene.add(nebula);

  const starLayers = [];
  const starUniforms = { uPx: { value: dpr }, uTime: { value: 0 }, uTwinkle: { value: reduced ? 0 : 1 } };
  function makeStars(count, rMin, rMax, sizeMin, sizeMax, gain, parallax, follow) {
    const pos = new Float32Array(count * 3), size = new Float32Array(count), bright = new Float32Array(count), col = new Float32Array(count * 3), ph = new Float32Array(count);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(rMin + Math.random() * (rMax - rMin));
      pos.set([v.x, v.y, v.z], i * 3);
      const m = Math.pow(Math.random(), 4.2); // many faint, few bright
      size[i] = sizeMin + (sizeMax - sizeMin) * Math.pow(m, 0.6);
      bright[i] = (0.12 + 1.4 * m) * gain;
      const t = Math.random(); const c = t < 0.12 ? [0.78, 0.86, 1.0] : t > 0.9 ? [1.0, 0.9, 0.78] : [0.95, 0.96, 1.0];
      col.set(c, i * 3); ph[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aBright", new THREE.BufferAttribute(bright, 1)); g.setAttribute("aColor", new THREE.BufferAttribute(col, 3)); g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: S.STAR_VERT, fragmentShader: S.STAR_FRAG, uniforms: starUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; pts.renderOrder = -5;
    const grp = new THREE.Group(); grp.add(pts); scene.add(grp);
    starLayers.push({ grp, parallax, follow });
  }
  const sc = Q.stars;
  makeStars(Math.round(9000 * sc), 900, 1100, 1.0, 1.8, 0.55, 0.004, 1.0);   // far: dim, small
  makeStars(Math.round(3200 * sc), 560, 700, 1.1, 2.4, 0.85, 0.012, 0.97); // mid
  makeStars(Math.round(700 * sc), 300, 380, 1.3, 3.0, 1.0, 0.028, 0.92);   // near: a little real parallax

  // ---------------------------------------------------------------- the sun
  const SUN_R = 3.2;
  const sunColor = new THREE.Color(1.0, 0.96, 0.9);
  const sunMat = new THREE.ShaderMaterial({ vertexShader: S.PLANET_VERT, fragmentShader: S.SUN_FRAG, uniforms: { uTime: { value: 0 } } });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 32), sunMat);
  scene.add(sun);
  // a tight corona sprite, not a cloud
  const coronaTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,240,220,1)"); g.addColorStop(0.28, "rgba(255,230,200,0.35)"); g.addColorStop(0.36, "rgba(255,215,170,0.05)"); g.addColorStop(0.6, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: coronaTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.28 }));
  corona.scale.setScalar(SUN_R * 3.2); scene.add(corona);

  // ---------------------------------------------------------------- worlds
  const LOOKS = {
    ocean: { r: 1.45, spec: 0.45, emit: [0, 0, 0], atmo: [0.25, 0.55, 0.6], atmoK: 0.55, bump: 0.04, tilt: 0.42, spin: 0.05, ring: true },
    violet: { r: 1.2, spec: 0, emit: [0, 0, 0], atmo: [0, 0, 0], atmoK: 0, bump: 0.05, tilt: 0.2, spin: 0.04 },
    ember: { r: 1.3, spec: 0, emit: [1.6, 0.45, 0.12], atmo: [0.6, 0.3, 0.15], atmoK: 0.18, bump: 0.08, tilt: 0.12, spin: 0.045 },
    ice: { r: 2.7, spec: 0.1, emit: [0, 0, 0], atmo: [0.45, 0.7, 0.8], atmoK: 0.35, bump: 0, tilt: 0.5, spin: 0.08 },
    rock: { r: 0.46, spec: 0, emit: [0, 0, 0], atmo: [0, 0, 0], atmoK: 0, bump: 0.08, tilt: 0.1, spin: 0.06 },
    moon: { r: 0.6, spec: 0, emit: [0.18, 0.38, 0.85], atmo: [0, 0, 0], atmoK: 0, bump: 0.1, tilt: 0.15, spin: 0.05 },
  };
  const ORBITS = { orbit: [13, 0.55], quest: [19, 2.6], ruckus: [25, 4.3], line: [33, 5.6] };
  const MOON_ORBITS = { construct: [4.0, 0.6, 0.16], vision: [5.1, 3.4, 0.11] };
  const bodies = new Map(); // id -> { group, mesh, r, data, angle, dist, speed, parent }
  const sunPos = new THREE.Vector3();
  let seed = 1.3;
  function makeBody(data) {
    const L = LOOKS[data.look]; const tex = bakeSurface(data.look, (seed += 3.71));
    const mat = new THREE.ShaderMaterial({
      vertexShader: S.PLANET_VERT, fragmentShader: S.PLANET_FRAG,
      uniforms: {
        tAlb: { value: tex.alb }, tMask: { value: tex.mask }, uSun: { value: sunPos }, uSunColor: { value: sunColor },
        uSpec: { value: L.spec }, uEmit: { value: new THREE.Vector3(...L.emit) }, uAtmo: { value: new THREE.Vector3(...L.atmo) }, uAtmoK: { value: L.atmoK },
        uBump: { value: L.bump }, uTexel: { value: new THREE.Vector2(1 / tex.w, 1 / tex.h) },
      },
    });
    const group = new THREE.Group(); const tilt = new THREE.Group(); tilt.rotation.z = L.tilt; group.add(tilt);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(L.r, Q.seg, Q.seg / 2), mat); tilt.add(mesh);
    if (L.ring) {
      const inner = L.r * 1.45, outer = L.r * 2.35;
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 160, 1), new THREE.ShaderMaterial({
        vertexShader: S.RING_VERT, fragmentShader: S.RING_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uSun: { value: sunPos }, uSunColor: { value: sunColor }, uCenter: { value: new THREE.Vector3() }, uR: { value: L.r }, uInner: { value: inner }, uOuter: { value: outer } },
      }));
      ring.rotation.x = -Math.PI / 2 + 0.08; tilt.add(ring); group.userData.ring = ring;
    }
    scene.add(group);
    const b = { id: data.id, data, group, mesh, r: L.r, spin: L.spin, angle: 0, dist: 0, speed: 0, parent: null };
    bodies.set(data.id, b);
    return b;
  }
  for (const w of WORLDS) { const b = makeBody(w); [b.dist, b.angle] = ORBITS[w.id]; b.speed = 0.6 / Math.pow(b.dist, 1.5); }
  for (const m of MOONS) { const b = makeBody(m); [b.dist, b.angle, b.speed] = MOON_ORBITS[m.id]; b.parent = bodies.get(m.parent); }

  // faint orbit lines, system view only
  const orbitLines = new THREE.Group(); scene.add(orbitLines);
  for (const w of WORLDS) {
    const r = ORBITS[w.id][0]; const pts = [];
    for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    orbitLines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8a9aa8, transparent: true, opacity: 0.09, depthWrite: false })));
  }

  // ---------------------------------------------------------------- floating preview screen (rides with the camera)
  const screenMat = new THREE.ShaderMaterial({
    vertexShader: S.SCREEN_VERT, fragmentShader: S.SCREEN_FRAG, transparent: true, depthTest: false, depthWrite: false,
    uniforms: { tMap: { value: null }, uTime: { value: 0 }, uOpacity: { value: 0 }, uSize: { value: new THREE.Vector2(300, 200) } },
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMat);
  screen.renderOrder = 20; screen.frustumCulled = false; camera.add(screen);
  const texLoader = new THREE.TextureLoader();
  const previewTex = new Map();
  function previewFor(data) {
    if (previewTex.has(data.id)) return previewTex.get(data.id);
    let t;
    if (data.preview) { t = texLoader.load(data.preview, (tx) => { tx.userData.aspect = tx.image.width / tx.image.height; }); t.colorSpace = THREE.SRGBColorSpace; t.userData.aspect = 1.6; }
    else { t = visionTexture(); }
    previewTex.set(data.id, t); return t;
  }
  // Vision has no public screenshots: draw its idea instead (page -> blocks -> library), looping.
  let visionDraw = null;
  function visionTexture() {
    const c = document.createElement("canvas"); c.width = 640; c.height = 400; const x = c.getContext("2d");
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.aspect = 1.6;
    const blocks = [[24, 40, 250, 40], [24, 92, 250, 110], [24, 214, 120, 80], [154, 214, 120, 80], [24, 306, 250, 60]];
    visionDraw = (time) => {
      const p = (time % 9) / 9;
      x.fillStyle = "#050607"; x.fillRect(0, 0, 640, 400);
      x.font = "300 13px 'IBM Plex Mono', monospace"; x.fillStyle = "rgba(220,230,240,.55)";
      x.fillText("PAGE", 24, 26); x.fillText("LIBRARY", 352, 26);
      x.strokeStyle = "rgba(220,230,240,.25)"; x.lineWidth = 1; x.strokeRect(14.5, 32.5, 270, 344);
      const scan = Math.min(1, p / 0.35) * 344 + 32;
      blocks.forEach(([bx, by, bw, bh], i) => {
        const cut = scan > by + bh;
        x.fillStyle = cut ? "rgba(140,190,255,.10)" : "rgba(220,230,240,.07)"; x.fillRect(bx, by, bw, bh);
        x.strokeStyle = cut ? "rgba(150,200,255,.7)" : "rgba(220,230,240,.18)"; x.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        const k = Math.max(0, Math.min(1, (p - 0.4 - i * 0.08) / 0.18)); const e = k * k * (3 - 2 * k);
        const tx = 352 + (i % 2) * 140, ty = 40 + Math.floor(i / 2) * 110;
        if (k > 0) {
          x.globalAlpha = Math.min(1, k * 1.5) * (p > 0.92 ? (1 - p) / 0.08 : 1);
          x.strokeStyle = "rgba(170,210,255,.85)"; x.strokeRect(bx + (tx - bx) * e + 0.5, by + (ty - by) * e + 0.5, bw + (120 - bw) * e, bh + (90 - bh) * e);
          if (k >= 1) { x.fillStyle = "rgba(200,220,240,.6)"; x.fillText(["header", "hero", "card", "card", "footer"][i], tx + 8, ty + 18); x.fillStyle = "rgba(150,200,255,.5)"; x.fillText("tested", tx + 8, ty + 80); }
          x.globalAlpha = 1;
        }
      });
      x.strokeStyle = `rgba(150,200,255,${0.6 * (1 - Math.min(1, p / 0.35))})`; x.beginPath(); x.moveTo(15, scan); x.lineTo(285, scan); x.stroke();
      t.needsUpdate = true;
    };
    visionDraw(0);
    return t;
  }

  // ---------------------------------------------------------------- post: bloom on highlights, grain, vignette
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: tier === "low" ? 0 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.12, 0.96);
  bloom.enabled = Q.bloom; composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const post = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2() }, uGrain: { value: 0.09 } }, vertexShader: S.SCREEN_VERT, fragmentShader: S.POST_FRAG });
  composer.addPass(post);

  // ---------------------------------------------------------------- sizing
  let W = 1, H = 1, portrait = false, wide = false;
  function resize() {
    W = innerWidth; H = innerHeight; portrait = H > W; wide = W >= 900 && W / H >= 1.25;
    renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    composer.setPixelRatio(dpr); composer.setSize(W, H);
    camera.aspect = W / H; camera.fov = portrait ? 50 : 40; camera.updateProjectionMatrix();
    starUniforms.uPx.value = dpr;
    post.uniforms.uRes.value.set(W * dpr, H * dpr);
    bloom.resolution.set(W * dpr * 0.5, H * dpr * 0.5);
  }
  addEventListener("resize", resize); resize();

  // ---------------------------------------------------------------- camera rig
  // state: target point, azimuth, elevation, distance, plus look offsets that frame the world beside the text
  const cam = { target: new THREE.Vector3(), az: 0.9, el: 0.42, dist: 60, offR: 0, offU: 0, roll: 0 };
  const view = { mode: "intro", focus: null, userAz: 0, userEl: 0, zoom: 1 };
  let flight = null;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function systemFit() {
    const R = 33 + 7; const fov = THREE.MathUtils.degToRad(camera.fov);
    const tanV = Math.tan(fov / 2), tanH = tanV * camera.aspect;
    // portrait: the camera is rolled 90 degrees so the orbital plane runs down the tall screen
    if (portrait) { const el = 0.3; return { dist: Math.max(R / tanV, (R * Math.sin(el) + 5) / tanH) * 1.12, el }; }
    const el = 0.42;
    return { dist: Math.max(R / tanH, (R * Math.sin(el) + 4) / tanV) * 0.9, el };
  }
  function goalFor(mode, focus) {
    if (mode === "system" || mode === "about") {
      const f = systemFit();
      return { target: new THREE.Vector3(), az: 0.9 + view.userAz, el: THREE.MathUtils.clamp(f.el + view.userEl, 0.12, 1.35), dist: f.dist * view.zoom * (mode === "about" ? 0.62 : 1), offR: mode === "about" && wide ? 0.22 : 0, offU: 0, roll: portrait ? Math.PI / 2 : 0, offRoll: mode === "about" && portrait ? 0.2 : 0 };
    }
    const b = bodies.get(focus); const p = b.group.position;
    const pa = Math.atan2(p.z, p.x); // angle around the sun
    const k = b.id === "orbit" ? 8.2 : b.id === "line" ? 6.6 : 6.2;
    const dist = b.r * k * (portrait ? 1.45 : 1);
    return { target: p.clone(), az: pa + Math.PI - 1.2 + view.userAz * 0.5, el: THREE.MathUtils.clamp(0.2 + view.userEl * 0.5, -0.5, 0.9), dist, offR: wide ? 0.25 : 0.06, offU: wide ? 0 : -0.24, roll: 0 };
  }
  function flyTo(mode, focus, dur = 2.4) {
    view.mode = mode; view.focus = focus; view.userAz = 0; view.userEl = 0; view.zoom = 1;
    flight = { t: 0, dur: reduced ? 0.01 : dur, from: { target: cam.target.clone(), az: cam.az, el: cam.el, dist: cam.dist, offR: cam.offR, offU: cam.offU, roll: cam.roll } };
  }
  function angLerp(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; }
  function updateCamera(dt) {
    const g = goalFor(view.mode === "intro" ? "system" : view.mode, view.focus);
    if (flight) {
      flight.t += dt / flight.dur; const e = ease(Math.min(1, flight.t)); const f = flight.from;
      // arc outward a little mid-flight so it feels like travel
      const lift = Math.sin(Math.PI * e) * (view.mode === "system" ? 0 : Math.max(0, (f.dist + g.dist) * 0.18));
      cam.target.lerpVectors(f.target, g.target, e); cam.az = angLerp(f.az, g.az, e); cam.el = f.el + (g.el - f.el) * e;
      cam.dist = f.dist + (g.dist - f.dist) * e + lift; cam.offR = f.offR + (g.offR - f.offR) * e; cam.offU = f.offU + (g.offU - f.offU) * e; cam.roll = f.roll + (g.roll - f.roll) * e;
      if (flight.t >= 1) flight = null;
    } else {
      const k = 1 - Math.exp(-dt * 5);
      cam.target.lerp(g.target, k); cam.az = angLerp(cam.az, g.az, k); cam.el += (g.el - cam.el) * k; cam.dist += (g.dist - cam.dist) * k;
      cam.offR += (g.offR - cam.offR) * k; cam.offU += (g.offU - cam.offU) * k; cam.roll += (g.roll - cam.roll) * k;
    }
    const ce = Math.cos(cam.el);
    camera.position.set(cam.target.x + cam.dist * ce * Math.cos(cam.az), cam.target.y + cam.dist * Math.sin(cam.el), cam.target.z + cam.dist * ce * Math.sin(cam.az));
    camera.lookAt(cam.target); camera.updateMatrixWorld();
    // shift the aim so the world sits beside (desktop) or above (phone) the text
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const aim = cam.target.clone().addScaledVector(right, cam.offR * cam.dist).addScaledVector(up, cam.offU * cam.dist);
    camera.lookAt(aim);
    if (cam.roll) camera.rotateZ(cam.roll);
    if (g.offRoll) camera.rotateX(-g.offRoll * 0.6); // about on a phone: lift the sun above the text
    // pointer / tilt parallax
    camera.rotateY(-par.x * 0.012); camera.rotateX(par.y * 0.008);
    camera.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- parallax input
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") { par.tx = (e.clientX / W) * 2 - 1; par.ty = (e.clientY / H) * 2 - 1; } });
  const tiltBtn = $("tilt");
  if (coarse && "DeviceOrientationEvent" in window && !reduced) {
    tiltBtn.hidden = false;
    let base = null;
    const onOrient = (e) => { if (e.beta == null) return; if (!base) base = { b: e.beta, g: e.gamma }; par.tx = THREE.MathUtils.clamp((e.gamma - base.g) / 20, -1, 1); par.ty = THREE.MathUtils.clamp((e.beta - base.b) / 20, -1, 1); };
    tiltBtn.addEventListener("click", async () => {
      if (tiltBtn.classList.contains("on")) { removeEventListener("deviceorientation", onOrient); tiltBtn.classList.remove("on"); par.tx = par.ty = 0; return; }
      try { if (typeof DeviceOrientationEvent.requestPermission === "function" && (await DeviceOrientationEvent.requestPermission()) !== "granted") return; } catch { return; }
      base = null; addEventListener("deviceorientation", onOrient); tiltBtn.classList.add("on");
    });
  }

  // ---------------------------------------------------------------- overlays
  const title = $("title"), hint = $("hint"), panel = $("panel"), about = $("about"), labelsEl = $("labels");
  (function buildTitle() {
    let i = 0;
    for (const word of ["THE NEW", "URBAN KID"]) {
      const w = document.createElement("span"); w.className = "w"; w.setAttribute("aria-hidden", "true");
      for (const ch of word) { const s = document.createElement("span"); s.className = "ch"; s.textContent = ch === " " ? " " : ch; s.style.transitionDelay = `${(i++) * 0.07}s`; w.appendChild(s); }
      title.appendChild(w); title.appendChild(document.createTextNode(" "));
    }
    const by = document.createElement("span"); by.className = "by"; by.setAttribute("aria-hidden", "true"); by.textContent = OWNER.person;
    title.appendChild(by);
  })();
  hint.textContent = coarse ? "Swipe to orbit · tap a world" : "Drag to orbit · click a world · arrows and Enter";

  const labels = new Map();
  for (const d of [...WORLDS, ...MOONS]) {
    const a = document.createElement("a"); a.className = "lbl"; a.href = `#${d.id}`; a.textContent = d.name;
    a.addEventListener("click", (e) => { e.preventDefault(); openBody(d.id); });
    labelsEl.appendChild(a); labels.set(d.id, a);
  }
  const sunLbl = document.createElement("a"); sunLbl.className = "lbl"; sunLbl.href = "#about"; sunLbl.textContent = "The star";
  sunLbl.addEventListener("click", (e) => { e.preventDefault(); openAbout(); }); labelsEl.appendChild(sunLbl); labels.set("sun", sunLbl);

  const ICON = {
    Enter: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M9 15l6-6M10 9h5v5"/></svg>',
    Source: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><path d="M9.5 9.5L7 12l2.5 2.5M14.5 9.5L17 12l-2.5 2.5"/></svg>',
    Status: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M6 13h3l2-4 2.5 7 2-3H18"/></svg>',
    Moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" stroke-dasharray="2 3"/><circle cx="12" cy="12" r="3.2"/></svg>',
    GitHub: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M9 18v-2.5c0-1 .3-1.6.8-2-2.3-.3-3.8-1.3-3.8-3.7 0-.9.3-1.7.9-2.3-.1-.4-.3-1.3.1-2.4 0 0 .8-.2 2.4.9a8 8 0 014.2 0c1.6-1.1 2.4-.9 2.4-.9.4 1.1.2 2 .1 2.4.6.6.9 1.4.9 2.3 0 2.4-1.5 3.4-3.8 3.7.5.4.8 1.1.8 2.1V18"/></svg>',
  };
  function glyphLink(link) {
    const a = document.createElement("a"); a.className = "glyph"; a.href = link.href; a.target = "_blank"; a.rel = "noopener";
    a.innerHTML = (ICON[link.label] || ICON.Enter) + `<span>${link.label}</span>`;
    return a;
  }
  function showPanel(d) {
    about.classList.remove("in"); about.hidden = true;
    panel.classList.remove("in");
    $("p-kicker").textContent = d.kicker || (d.moons ? "World · two moons" : "World");
    $("p-name").textContent = d.name; $("p-pitch").textContent = d.pitch;
    $("p-facts").replaceChildren(...d.facts.map((f) => { const li = document.createElement("li"); li.textContent = f; return li; }));
    $("p-tags").replaceChildren(...d.tags.map((t) => { const s = document.createElement("span"); s.className = "tag"; s.textContent = t; return s; }));
    const moons = $("p-moons"); moons.replaceChildren(); moons.hidden = !d.moons;
    for (const id of d.moons || []) {
      const m = byId(id); const a = document.createElement("a"); a.className = "glyph"; a.href = `#${id}`; a.innerHTML = ICON.Moon + `<span>${m.name}</span>`;
      a.addEventListener("click", (e) => { e.preventDefault(); openBody(id); }); moons.appendChild(a);
    }
    const links = $("p-links"); links.replaceChildren();
    for (const l of d.links) {
      if (l.live === false) {
        const pend = document.createElement("span"); pend.className = "glyph pending"; pend.innerHTML = ICON.Status + `<span>${l.pending}</span>`; links.appendChild(pend);
      } else links.appendChild(glyphLink(l));
    }
    if (d.note) { const n = document.createElement("span"); n.className = "note"; n.textContent = d.note; links.appendChild(n); }
    const back = $("p-back"); back.querySelector("span").textContent = d.parent ? `Back to ${byId(d.parent).name}` : "Back to the system";
    panel.hidden = false; panel.scrollTop = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add("in")));
  }
  function hidePanels() { panel.classList.remove("in"); about.classList.remove("in"); setTimeout(() => { if (!panel.classList.contains("in")) panel.hidden = true; if (!about.classList.contains("in")) about.hidden = true; }, 400); }
  $("about-line").textContent = OWNER.line;
  const gh = $("about-gh"); gh.href = OWNER.github; gh.innerHTML = ICON.GitHub + "<span>GitHub</span>";

  // ---------------------------------------------------------------- navigation
  const order = WORLDS.map((w) => w.id);
  let selected = 0;
  function openBody(id) {
    const d = byId(id); if (!d) return;
    dismissIntro(); flyTo("world", id, view.mode === "world" ? 2.2 : 2.6);
    screenFade.target = 0; setTimeout(() => { if (view.focus === id) { screenMat.uniforms.tMap.value = previewFor(d); screenFade.target = 1; } }, reduced ? 0 : 1200);
    showPanel(d); selected = Math.max(0, order.indexOf(d.parent || id));
    title.classList.add("away"); hint.classList.remove("on");
    history.replaceState(null, "", `#${id}`);
  }
  function openAbout() {
    dismissIntro(); flyTo("about", null, 2.0); screenFade.target = 0;
    panel.classList.remove("in"); panel.hidden = true; about.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => about.classList.add("in")));
    title.classList.add("away"); history.replaceState(null, "", "#about");
  }
  function back() {
    if (view.mode === "world") { const d = byId(view.focus); if (d.parent) return openBody(d.parent); }
    if (view.mode === "system") return;
    flyTo("system", null, 2.4); screenFade.target = 0; hidePanels(); title.classList.remove("away");
    history.replaceState(null, "", location.pathname + location.search);
  }
  $("p-back").addEventListener("click", (e) => { e.preventDefault(); back(); });
  $("about-back").addEventListener("click", (e) => { e.preventDefault(); back(); });
  addEventListener("keydown", (e) => {
    if (document.body.classList.contains("list")) return;
    if (e.key === "Escape") { back(); return; }
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) {
      e.preventDefault(); dismissIntro();
      selected = (selected + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : order.length - 1)) % order.length;
      if (view.mode === "world") openBody(order[selected]);
      return;
    }
    if (e.key === "Enter" && !(e.target instanceof HTMLAnchorElement) && !(e.target instanceof HTMLButtonElement)) {
      if (view.mode === "system" || view.mode === "intro") { dismissIntro(); openBody(order[selected]); }
      else if (view.mode === "world") { const l = byId(view.focus).links.find((x) => x.live !== false); if (l) window.open(l.href, "_blank", "noopener"); }
    }
  });

  // ---------------------------------------------------------------- gestures: drag/swipe orbit, tap, double-tap, pinch, wheel
  const pointers = new Map(); let drag = null, pinch = null, lastTap = 0, tapTimer = 0;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), zoom0: view.zoom }; drag = null; }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const s = Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0;
      if (view.mode === "world" || view.mode === "about") { if (s < 0.7) { pinch = null; back(); } }
      else view.zoom = THREE.MathUtils.clamp(pinch.zoom0 / s, 0.45, 1.6);
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 6) { dismissIntro(); const rolled = cam.roll > 0.8; view.userAz += (rolled ? -dy : dx) * 0.0055; view.userEl += (rolled ? dx : dy) * 0.004; view.userEl = THREE.MathUtils.clamp(view.userEl, -0.9, 0.9); }
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    if (!drag || pointers.size) { if (!pointers.size) drag = null; return; }
    const isTap = drag.moved < 8 && performance.now() - drag.t < 450; const { x, y } = drag; drag = null;
    if (!isTap || e.type === "pointercancel") return;
    const now = performance.now();
    if (now - lastTap < 320) { clearTimeout(tapTimer); lastTap = 0; if (view.mode !== "system") back(); return; }
    lastTap = now;
    if (view.mode === "system" || view.mode === "intro") handleTap(x, y);
    else tapTimer = setTimeout(() => handleTap(x, y), 300);
  };
  canvas.addEventListener("pointerup", endPointer); canvas.addEventListener("pointercancel", endPointer);
  let wheelAcc = 0;
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault(); dismissIntro();
    if (view.mode === "system") view.zoom = THREE.MathUtils.clamp(view.zoom * Math.exp(e.deltaY * 0.0012), 0.45, 1.6);
    else { wheelAcc += e.deltaY; if (wheelAcc > 260) { wheelAcc = 0; back(); } }
  }, { passive: false });

  const tmp = new THREE.Vector3();
  function screenOf(obj, r) {
    obj.getWorldPosition(tmp); const d = camera.position.distanceTo(tmp); tmp.project(camera);
    const pr = (r / (d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) * (H / 2);
    return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H, r: pr, front: tmp.z < 1, d };
  }
  function pickables() {
    const ids = [...order];
    if (view.mode === "world" && (view.focus === "line" || byId(view.focus).parent === "line")) ids.push("construct", "vision");
    return ids.map((id) => ({ id, ...screenOf(bodies.get(id).group, bodies.get(id).r) })).concat([{ id: "sun", ...screenOf(sun, SUN_R) }]);
  }
  function handleTap(x, y) {
    let best = null, bestD = Infinity;
    for (const p of pickables()) {
      if (!p.front || p.id === view.focus) continue;
      const d = Math.hypot(p.x - x, p.y - y); const reach = Math.max(30, p.r * 1.15 + 12);
      if (d < reach && d - p.r < bestD) { best = p; bestD = d - p.r; }
    }
    if (!best) return;
    if (best.id === "sun") openAbout(); else openBody(best.id);
  }

  // ---------------------------------------------------------------- intro
  let introDone = false;
  function dismissIntro() {
    if (introDone) return; introDone = true;
    title.classList.add("in", "docked"); if (!reduced) title.classList.add("pulse");
    if (view.mode === "intro") view.mode = "system";
    setTimeout(() => { if (view.mode === "system") hint.classList.add("on"); }, 900);
  }
  // start far out and fly in
  cam.dist = systemFit().dist * 3.4; cam.el = 0.08; cam.az = 0.9 - 1.1; cam.target.set(0, 0, 0);
  cam.roll = portrait ? Math.PI / 2 : 0;
  flight = { t: 0, dur: reduced ? 0.01 : 4.2, from: { target: new THREE.Vector3(), az: cam.az, el: cam.el, dist: cam.dist, offR: 0, offU: 0, roll: cam.roll } };
  setTimeout(() => title.classList.add("in"), reduced ? 0 : 900);
  setTimeout(() => { if (!reduced) title.classList.add("pulse"); }, 3200);
  setTimeout(() => { if (!introDone) dismissIntro(); }, reduced ? 1200 : 5600);
  const startHash = location.hash.slice(1);
  if (startHash) setTimeout(() => { if (startHash === "about") openAbout(); else if (byId(startHash)) openBody(startHash); }, reduced ? 50 : 3000);

  // ---------------------------------------------------------------- lightning behind the nebula
  const flash = { next: 6 + Math.random() * 6, t: -1, dir: new THREE.Vector3() };
  const patches = [new THREE.Vector3(-0.75, 0.22, -0.62).normalize(), new THREE.Vector3(0.70, -0.18, 0.69).normalize()];
  function updateFlash(dt, time) {
    if (reduced) return;
    if (flash.t < 0 && time > flash.next) {
      flash.t = 0; const c = patches[Math.random() < 0.5 ? 0 : 1];
      flash.dir.copy(c).add(new THREE.Vector3().randomDirection().multiplyScalar(0.22)).normalize();
      nebula.material.uniforms.uFlashDir.value.copy(flash.dir);
      nebula.material.uniforms.uFlashCol.value.setRGB(...(c === patches[0] ? [0.8, 0.6, 1.0] : [0.55, 0.95, 1.0]));
    }
    if (flash.t >= 0) {
      flash.t += dt; const t = flash.t;
      // a double flicker, then gone
      const v = Math.exp(-Math.pow((t - 0.05) / 0.035, 2)) * 0.8 + Math.exp(-Math.pow((t - 0.2) / 0.05, 2)) + Math.exp(-Math.pow((t - 0.32) / 0.03, 2)) * 0.5;
      nebula.material.uniforms.uFlash.value = v;
      if (t > 0.6) { flash.t = -1; flash.next = time + 7 + Math.random() * 12; nebula.material.uniforms.uFlash.value = 0; }
    }
  }

  // ---------------------------------------------------------------- frame loop
  const screenFade = { v: 0, target: 0 };
  const clock = new THREE.Clock();
  let time = 0, frames = 0, slow = 0, checkAt = 3;
  function placeScreen(dt) {
    screenFade.v += (screenFade.target - screenFade.v) * (1 - Math.exp(-dt * 3));
    screenMat.uniforms.uOpacity.value = screenFade.v; screen.visible = screenFade.v > 0.01;
    if (!screen.visible) return;
    const tx = screenMat.uniforms.tMap.value; const aspect = (tx && tx.userData.aspect) || 1.6;
    const D = 6, halfH = D * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), halfW = halfH * camera.aspect;
    // layout in viewport fractions: [cx, cy, max width, max height]
    const L = wide ? [0.4, 0.8, 0.17, 0.26] : portrait ? [0.76, 0.2, 0.4, 0.2] : [0.78, 0.3, 0.3, 0.38];
    let wPx = L[2] * W, hPx = wPx / aspect; if (hPx > L[3] * H) { hPx = L[3] * H; wPx = hPx * aspect; }
    const float = reduced ? 0 : Math.sin(time * 0.6) * 0.012;
    screen.position.set((L[0] * 2 - 1) * halfW, (1 - L[1] * 2) * halfH + float * halfH, -D);
    screen.scale.set((wPx / W) * 2 * halfW, (hPx / H) * 2 * halfH, 1);
    screen.rotation.set(0, wide ? 0.12 : -0.08, 0);
    screenMat.uniforms.uSize.value.set(wPx, hPx);
    screen.rotation.z = reduced ? 0 : Math.sin(time * 0.4) * 0.006;
  }
  let panelRect = null;
  function placeLabels() {
    panelRect = panel.hidden ? null : panel.getBoundingClientRect();
    const showSys = view.mode === "system" && introDone;
    const nearLine = view.mode === "world" && (view.focus === "line" || byId(view.focus)?.parent === "line");
    const placed = [];
    for (const [id, el] of labels) {
      const isMoon = id === "construct" || id === "vision";
      let on = (showSys && !isMoon) || (nearLine && isMoon && id !== view.focus);
      if (on) {
        const obj = id === "sun" ? sun : bodies.get(id).group; const r = id === "sun" ? SUN_R : bodies.get(id).r;
        const s = screenOf(obj, r); on = s.front;
        if (!el._w) el._w = el.offsetWidth || 120;
        let x = Math.round(s.x + s.r + 6), y = Math.round(s.y - 18);
        let flip = x + el._w > W - 6;
        if (flip) { x = Math.round(s.x - s.r - 6 - el._w); if (x < 6) { flip = false; x = Math.round(Math.min(Math.max(6, s.x - el._w / 2), W - el._w - 6)); y = Math.round(s.y + s.r + 2); } }
        el.classList.toggle("flip", flip);
        placed.push({ el, x, y, w: el._w });
        if (isMoon && panelRect && x + el._w > panelRect.left && x < panelRect.right && y + 30 > panelRect.top && y < panelRect.bottom) on = false;
      }
      el.classList.toggle("on", on); el.tabIndex = on ? 0 : -1;
      el.classList.toggle("sel", showSys && order[selected] === id);
      if (!on) { const i = placed.findIndex((p) => p.el === el); if (i >= 0) placed.splice(i, 1); }
    }
    // nudge overlapping labels apart, top to bottom
    placed.sort((a, b) => a.y - b.y);
    for (let i = 1; i < placed.length; i++) for (let j = 0; j < i; j++) {
      const a = placed[j], b = placed[i];
      if (b.y - a.y < 22 && b.x < a.x + a.w && a.x < b.x + b.w) b.y = a.y + 22;
    }
    for (const p of placed) p.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05); time += dt;
    // adaptive quality: if the first seconds run slow, step down
    frames++; if (dt > 0.022) slow++;
    if (time > checkAt) {
      if (slow / frames > 0.5) { if (dpr > 1) { dpr = Math.max(1, dpr * 0.75); resize(); } else if (bloom.enabled) bloom.enabled = false; }
      frames = 0; slow = 0; checkAt = time + 3;
    }
    par.x += (par.tx - par.x) * (1 - Math.exp(-dt * 2.5)); par.y += (par.ty - par.y) * (1 - Math.exp(-dt * 2.5));
    if (reduced) { par.x = par.y = 0; }
    // bodies
    for (const b of bodies.values()) {
      b.angle += b.speed * dt * (reduced ? 0.3 : 1);
      if (b.parent) b.group.position.set(b.parent.group.position.x + Math.cos(b.angle) * b.dist, Math.sin(b.angle * 0.7) * 0.35, b.parent.group.position.z + Math.sin(b.angle) * b.dist);
      else b.group.position.set(Math.cos(b.angle) * b.dist, 0, Math.sin(b.angle) * b.dist);
      b.mesh.rotation.y += b.spin * dt;
      if (b.group.userData.ring) b.group.userData.ring.material.uniforms.uCenter.value.copy(b.group.position);
    }
    sunMat.uniforms.uTime.value = time; starUniforms.uTime.value = time; screenMat.uniforms.uTime.value = time; post.uniforms.uTime.value = time;
    updateCamera(dt);
    // sky follows the camera (mostly), near layers lag a little for real parallax, and tilt with the pointer
    nebula.position.copy(camera.position);
    for (const s of starLayers) { s.grp.position.copy(camera.position).multiplyScalar(s.follow); s.grp.rotation.set(par.y * s.parallax * 3, par.x * s.parallax * 4, 0); }
    const sysT = view.mode === "system" || view.mode === "intro" || view.mode === "about" ? 1 : 0;
    for (const l of orbitLines.children) l.material.opacity += (sysT * 0.09 - l.material.opacity) * 0.05;
    updateFlash(dt, time);
    if (visionDraw && view.focus === "vision") visionDraw(time);
    placeScreen(dt); placeLabels();
    composer.render(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__tnuk = { get tier() { return tier; }, get dpr() { return dpr; }, gpu, openBody, back, openAbout, view };
}
