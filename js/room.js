// The studio: real photos on planes and simple boxes at real depths, lit only by the practical lights.
import * as THREE from "three";
import { byId } from "./data.js";

const PHOTO_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const PHOTO_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 uLP[4]; uniform vec3 uLC[4]; uniform float uLR[4];
uniform vec3 uAmb, uTint, uGlow;
uniform float uSelf, uHover, uOpacity, uEdge;
uniform vec2 uRepeat;
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main() {
  vec4 c = texture2D(map, vUv * uRepeat);
  float a = c.a * uOpacity;
  if (uEdge > 0.0) { vec2 e = min(vUv, 1.0 - vUv); a *= smoothstep(0.0, uEdge, e.x) * smoothstep(0.0, uEdge, e.y); }
  if (a < 0.004) discard;
  vec3 L = uAmb;
  for (int i = 0; i < 4; i++) {
    vec3 d = uLP[i] - vW; float dd = dot(d, d);
    float ndl = 0.3 + 0.7 * max(dot(d * inversesqrt(dd), vN), 0.0);
    L += uLC[i] * ndl / (1.0 + dd * uLR[i]);
  }
  vec3 base = c.rgb * uTint;
  vec3 col = base * mix(L, vec3(1.0), uSelf);
  col += base * uHover * 1.1 + uGlow * uHover * 0.035;
  gl_FragColor = vec4(col, a);
}`;

// CRT glass: the Orbit preview, bent and scanned, glowing
const SCREEN_FRAG = /* glsl */ `
uniform sampler2D map; uniform float uTime, uHover, uPower;
varying vec2 vUv;
void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv *= 1.0 + 0.08 * dot(uv, uv);                       // tube curvature
  vec2 t = uv * 0.5 + 0.5;
  vec2 pan = vec2(0.5 + sin(uTime * 0.021) * 0.08, 0.5 + cos(uTime * 0.017) * 0.05);
  vec2 s = (t - 0.5) * 0.78 + pan;                     // slow drift across the space scene
  vec3 col;
  col.r = texture2D(map, s + vec2(0.0012, 0.0)).r;
  col.g = texture2D(map, s).g;
  col.b = texture2D(map, s - vec2(0.0012, 0.0)).b;
  col = pow(col, vec3(0.9)) * 1.4 + vec3(0.01, 0.025, 0.04);
  float scan = 0.78 + 0.22 * sin(t.y * 520.0);
  float roll = 1.0 + 0.06 * smoothstep(0.02, 0.0, abs(fract(t.y - uTime * 0.07) - 0.5) - 0.0);
  float edge = smoothstep(1.0, 0.86, max(abs(uv.x), abs(uv.y)));
  float vig = 1.0 - 0.45 * dot(uv, uv);
  float flick = 0.96 + 0.04 * sin(uTime * 57.0) * sin(uTime * 13.0);
  col *= scan * roll * vig * flick * edge * uPower * (1.0 + 0.35 * uHover);
  gl_FragColor = vec4(col, edge);
}`;

const PAD_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uI;
varying vec2 vUv;
void main() {
  vec2 q = abs(vUv - 0.5) * 2.0;
  float box = 1.0 - smoothstep(0.78, 1.0, max(q.x, q.y));
  float halo = exp(-dot(q, q) * 1.6) * 0.35;
  gl_FragColor = vec4(uColor * uI * (box * 0.9 + halo), 1.0);
}`;

const RECORD_FRAG = /* glsl */ `
uniform sampler2D map; uniform vec3 uCenter; uniform vec3 uLP[4]; uniform vec3 uLC[4]; uniform float uLR[4]; uniform vec3 uAmb; uniform float uHover;
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main() {
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.01) discard;
  vec3 L = uAmb;
  for (int i = 0; i < 4; i++) { vec3 d = uLP[i] - vW; L += uLC[i] / (1.0 + dot(d, d) * uLR[i]); }
  // the sheen of a record stays put while the grooves turn under it
  vec3 p = vW - uCenter;
  float ang = atan(p.z, p.x);
  float sheen = pow(abs(cos(ang * 2.0 + 0.6)), 10.0) * 0.55 + pow(abs(cos(ang * 2.0 + 0.6)), 60.0) * 0.6;
  float grooves = 0.75 + 0.25 * sin(length(p.xz) * 900.0);
  vec3 col = c.rgb * L + vec3(0.9, 0.86, 0.8) * sheen * grooves * (dot(L, vec3(0.33)) * 0.35 + 0.02) * c.a;
  col *= 1.0 + uHover * 0.8;
  gl_FragColor = vec4(col, c.a);
}`;

export const LIGHTS = {
  pos: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
  col: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
  rad: [7, 12, 30, 5],
};
const SHARED = { uLP: { value: LIGHTS.pos }, uLC: { value: LIGHTS.col }, uLR: { value: LIGHTS.rad }, uAmb: { value: new THREE.Vector3(0.018, 0.018, 0.024) } };

function photoMat(map, o = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: PHOTO_VERT, fragmentShader: PHOTO_FRAG,
    transparent: o.transparent ?? true, depthWrite: true,
    uniforms: {
      ...SHARED, map: { value: map },
      uTint: { value: new THREE.Color(...(o.tint || [1, 1, 1])) }, uGlow: { value: new THREE.Color(...(o.glow || [1, 0.8, 0.6])) },
      uSelf: { value: o.self ?? 0 }, uHover: { value: 0 }, uOpacity: { value: 1 }, uEdge: { value: o.edge ?? 0 },
      uRepeat: { value: new THREE.Vector2(...(o.repeat || [1, 1])) },
    },
  });
}

function radialTex(stops) {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function glow(color, size, intensity) {
  const m = new THREE.SpriteMaterial({ map: radialTex([[0, "#fff"], [0.18, "rgba(255,255,255,.55)"], [0.5, "rgba(255,255,255,.12)"], [1, "rgba(255,255,255,0)"]]),
    color: new THREE.Color(...color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(m); s.scale.setScalar(size); return s;
}

function shadow(w, d, strength = 0.85) {
  const m = new THREE.MeshBasicMaterial({ map: radialTex([[0, `rgba(0,0,0,${strength})`], [0.55, `rgba(0,0,0,${strength * 0.5})`], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.y = 0.0015; p.renderOrder = 1; return p;
}

// bilinear quad between four corners (in the parent's plane), so the glow sits exactly on the tube
function quadGeo(c, n = 16) {
  const g = new THREE.PlaneGeometry(1, 1, n, n), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const top = [c.tl[0] + (c.tr[0] - c.tl[0]) * u, c.tl[1] + (c.tr[1] - c.tl[1]) * u];
    const bot = [c.bl[0] + (c.br[0] - c.bl[0]) * u, c.bl[1] + (c.br[1] - c.bl[1]) * u];
    p.setXYZ(i, bot[0] + (top[0] - bot[0]) * v, bot[1] + (top[1] - bot[1]) * v, 0);
  }
  g.computeVertexNormals(); return g;
}

const lerp = (a, b, t) => a + (b - a) * t;
const L3 = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

// portrait (phone) and landscape (desktop) arrangements; anything between is blended
const LAYOUT = {
  P: {
    cam: [0, 1.3, 2.2], look: [0, 0.16, -0.28], fov: 62, desk: [-1.9, 1.9],
    crt: [0.02, 0, -0.62], crtW: 0.56, spL: [-0.55, 0, -0.74], spR: [0.55, 0, -0.76],
    lamp: [-0.92, 0, -0.84], mpc: [-0.2, 0, 0.42], mpcYaw: 0.08, tt: [0.33, 0, 0.12], ttYaw: -0.14,
    win: [0.3, 1.02, 0.5, 0.42], cork: [-0.33, 1.0, 0.52, 0.38], flyer: [0.45, 0.56, 0.24, 0.33],
    crate: [-0.36, -0.44, 1.02], crateW: 0.55, crateTilt: -1.05,
    prod: [0.03, -0.3, 1.0], prodH: 0.76,
  },
  L: {
    cam: [0, 0.92, 2.2], look: [0, 0.24, -0.4], fov: 40, desk: [-1.9, 0.8],
    crt: [-0.04, 0, -0.62], crtW: 0.54, spL: [-0.66, 0, -0.74], spR: [0.62, 0, -0.76],
    lamp: [-1.42, 0, -0.8], mpc: [-0.36, 0, 0.14], mpcYaw: 0.08, tt: [0.36, 0, -0.04], ttYaw: -0.12,
    win: [0.36, 0.96, 0.62, 0.48], cork: [-0.6, 0.92, 0.62, 0.44], flyer: [1.0, 0.6, 0.3, 0.41],
    crate: [1.06, -0.36, 0.16], crateW: 0.72, crateTilt: -0.95,
    prod: [-0.02, -0.3, 0.96], prodH: 0.78,
  },
};

export async function buildRoom({ tex, meta, canvases, reduced }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0, 0, 0);
  const objs = {};

  // ---------- architecture: wall, desk, floor
  tex.wall.wrapS = tex.wall.wrapT = THREE.RepeatWrapping;
  tex.desk.wrapS = tex.desk.wrapT = THREE.RepeatWrapping;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), photoMat(tex.wall, { tint: [0.15, 0.14, 0.135], repeat: [3, 1.9], transparent: false }));
  wall.position.set(0, 1.2, -1.0); scene.add(wall);
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.6), photoMat(tex.desk, { tint: [0.8, 0.68, 0.6], repeat: [2.2, 1], transparent: false }));
  desk.rotation.x = -Math.PI / 2; desk.position.set(0, 0, -0.2); scene.add(desk);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(1, 0.045, 0.02), photoMat(tex.desk, { tint: [0.3, 0.26, 0.23], transparent: false }));
  edge.position.set(0, -0.0225, 0.6); scene.add(edge);
  const deskEnd = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.74, 1.6), photoMat(tex.desk, { tint: [0.16, 0.14, 0.12], transparent: false }));
  deskEnd.position.set(0, -0.37, -0.2); scene.add(deskEnd);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), photoMat(tex.desk, { tint: [0.12, 0.1, 0.09], repeat: [5, 4], transparent: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.76, 0.5); scene.add(floor);

  // ---------- window: city lights out of focus behind the glass
  const winMat = new THREE.ShaderMaterial({
    vertexShader: PHOTO_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform float uTime; varying vec2 vUv;
      void main() {
        vec2 uv = vUv; vec3 c = texture2D(map, uv * vec2(0.92, 0.9) + vec2(0.04 + sin(uTime * 0.01) * 0.02, 0.05)).rgb;
        c *= 0.34;
        c += vec3(0.010, 0.012, 0.016) * smoothstep(0.9, 0.0, distance(uv, vec2(0.3, 0.75)));
        float fx = min(uv.x, 1.0 - uv.x), fy = min(uv.y, 1.0 - uv.y);
        float frame = step(fx, 0.035) + step(fy, 0.04) + step(abs(uv.x - 0.5), 0.012) + step(abs(uv.y - 0.58), 0.012);
        c = mix(c, vec3(0.012, 0.011, 0.012), clamp(frame, 0.0, 1.0));
        c += vec3(0.02, 0.025, 0.03) * smoothstep(0.2, 1.0, uv.y + uv.x * 0.3);
        gl_FragColor = vec4(c, 1.0);
      }`,
    uniforms: { map: { value: tex.window }, uTime: { value: 0 } },
  });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), winMat); scene.add(win);

  // ---------- cork board with polaroids and the credit card, and the fight flyer
  const cork = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), photoMat(canvases.cork, { tint: [0.9, 0.86, 0.82], self: 0.08 })); scene.add(cork);
  const flyer = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), photoMat(canvases.flyer, { tint: [0.95, 0.95, 0.95], glow: [1, 1, 1], self: 0.12 }));
  scene.add(flyer); objs.ruckus = { mesh: flyer, mats: [flyer.material], hover: 0 };

  // ---------- CRT with Orbit on the tube
  const crtA = tex.crt.image.width / tex.crt.image.height;
  const crt = new THREE.Group(); scene.add(crt);
  const crtBody = new THREE.Mesh(new THREE.PlaneGeometry(1, 1 / crtA), photoMat(tex.crt, { tint: [0.62, 0.6, 0.58], glow: [0.6, 0.8, 1] }));
  crtBody.position.y = 0.5 / crtA; crt.add(crtBody);
  const sc = meta.crtScreen, H = 1 / crtA;
  const toLocal = (k) => [sc[k][0] - 0.5, (sc[k][1] - 0.5) * H];
  const screenMat = new THREE.ShaderMaterial({ vertexShader: PHOTO_VERT, fragmentShader: SCREEN_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { map: { value: tex.orbit }, uTime: { value: 0 }, uHover: { value: 0 }, uPower: { value: 2.3 } } });
  const screen = new THREE.Mesh(quadGeo({ tl: toLocal("tl"), tr: toLocal("tr"), br: toLocal("br"), bl: toLocal("bl") }), screenMat);
  screen.position.set(0, 0.5 / crtA, 0.002); crt.add(screen);
  const scrC = ["tl", "tr", "br", "bl"].map(toLocal).reduce((a, b) => [a[0] + b[0] / 4, a[1] + b[1] / 4], [0, 0]);
  const crtShadow = shadow(1.25, 0.55); crt.add(crtShadow);
  screen.renderOrder = 3;
  objs.orbit = { mesh: crtBody, group: crt, mats: [crtBody.material], screen: screenMat, hover: 0, screenLocal: new THREE.Vector3(scrC[0], scrC[1] + 0.5 / crtA, 0.02) };

  // ---------- studio monitors
  const spA = tex.speaker.image.width / tex.speaker.image.height;
  const dark = (t) => photoMat(tex.desk, { tint: [t, t * 0.95, t * 0.92], transparent: false });
  const speakers = [];
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    const front = photoMat(tex.speaker, { tint: [0.5, 0.5, 0.52], transparent: false });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22 / spA, 0.24), [dark(0.07), dark(0.07), dark(0.09), dark(0.05), front, dark(0.05)]);
    box.position.y = 0.11 / spA; box.rotation.y = -side * 0.22; g.add(box);
    const led = glow([1, 0.06, 0.03], 0.022, 4.0); led.position.set(0.075 * Math.cos(side * 0.22), 0.22 / spA * 0.15 + 0.004, 0.125); g.add(led);
    g.add(shadow(0.4, 0.42)); scene.add(g); speakers.push(g);
  }

  // ---------- lamp and books: the warm practical light
  const lampA = tex.lamp.image.width / tex.lamp.image.height, LW = 0.8;
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(LW, LW / lampA), photoMat(tex.lamp, { self: 0.72, tint: [0.95, 0.9, 0.85] }));
  lamp.geometry.translate(0, LW / lampA / 2, 0); scene.add(lamp);
  const bulb = glow([1, 0.72, 0.42], 0.3, 0.9); scene.add(bulb);
  const lampShadow = shadow(LW * 1.1, 0.3, 0.6); scene.add(lampShadow);

  // ---------- MPC: Line framework, its pads light up, two of them are Construct and Vision
  const mpcA = tex.mpc.image.width / tex.mpc.image.height, MW = 0.44;
  const mpc = new THREE.Group(); scene.add(mpc);
  const mpcSlab = new THREE.Mesh(new THREE.BoxGeometry(MW * 0.99, 0.045, MW / mpcA * 0.99), dark(0.06)); mpcSlab.position.y = 0.0225; mpc.add(mpcSlab);
  const mpcTop = new THREE.Mesh(new THREE.PlaneGeometry(MW, MW / mpcA), photoMat(tex.mpc, { tint: [0.85, 0.85, 0.88], glow: [1, 0.7, 0.4] }));
  mpcTop.rotation.x = -Math.PI / 2; mpcTop.position.y = 0.0452; mpc.add(mpcTop);
  mpc.add(shadow(MW * 1.35, MW / mpcA * 1.35));
  const PADC = [[1, 0.42, 0.12], [1, 0.2, 0.32], [0.95, 0.55, 0.2], [0.6, 0.3, 1], [0.3, 0.75, 1], [1, 0.3, 0.12]];
  const pads = meta.mpcPads.map((p, i) => {
    const m = new THREE.ShaderMaterial({ vertexShader: PHOTO_VERT, fragmentShader: PAD_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(...PADC[(i * 7) % PADC.length]) }, uI: { value: 0.0 } } });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p[2] * MW * 1.1, p[3] * MW / mpcA * 1.1), m);
    mesh.position.set((p[0] + p[2] / 2 - 0.5) * MW, (p[1] + p[3] / 2 - 0.5) * MW / mpcA, 0.0008);
    mesh.renderOrder = 3; mpcTop.add(mesh); return { mesh, m, i, level: 0 };
  });
  // bottom-left two pads, nearest the thumb: Construct (warm white) and Vision (cyan)
  const padConstruct = pads[12], padVision = pads[13];
  padConstruct.m.uniforms.uColor.value.setRGB(1, 0.78, 0.5);
  padVision.m.uniforms.uColor.value.setRGB(0.35, 0.85, 1);
  const lcd = meta.mpcScreen;
  const lcdMesh = new THREE.Mesh(new THREE.PlaneGeometry(lcd[2] * MW, lcd[3] * MW / mpcA),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.22, 0.6), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  lcdMesh.renderOrder = 3; lcdMesh.position.set((lcd[0] + lcd[2] / 2 - 0.5) * MW, (lcd[1] + lcd[3] / 2 - 0.5) * MW / mpcA, 0.0006); mpcTop.add(lcdMesh);
  objs.line = { mesh: mpcTop, group: mpc, mats: [mpcTop.material], hover: 0, pads };
  objs.construct = { mesh: padConstruct.mesh, pad: padConstruct, hover: 0, parent: "line" };
  objs.vision = { mesh: padVision.mesh, pad: padVision, hover: 0, parent: "line" };

  // ---------- turntable: a dark plinth, a platter, the record with A Vibe Called Quest on its label
  const tt = new THREE.Group(); scene.add(tt);
  const TW = 0.46, TD = 0.36, TH = 0.07;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(TW, TH, TD), [dark(0.75), dark(0.75), photoMat(tex.desk, { tint: [0.42, 0.38, 0.35], transparent: false }), dark(0.05), dark(0.85), dark(0.3)]);
  plinth.position.y = TH / 2; tt.add(plinth);
  for (const m of plinth.material) m.uniforms.uSelf.value = 0.22;
  const R = 0.152, platterY = TH + 0.012;
  const platter = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.02, R * 1.02, 0.012, 96), dark(0.45));
  platter.position.set(-0.05, TH + 0.006, 0); tt.add(platter);
  const spin = new THREE.Group(); spin.position.set(-0.05, platterY + 0.0012, 0); tt.add(spin);
  const recMat = new THREE.ShaderMaterial({ vertexShader: PHOTO_VERT, fragmentShader: RECORD_FRAG, transparent: true,
    uniforms: { ...SHARED, map: { value: tex.record }, uCenter: { value: new THREE.Vector3() }, uHover: { value: 0 } } });
  const rec = new THREE.Mesh(new THREE.CircleGeometry(R, 128), recMat); rec.rotation.x = -Math.PI / 2; spin.add(rec);
  // CircleGeometry uv maps the disc to the square, which is what the record texture expects
  const label = new THREE.Mesh(new THREE.CircleGeometry(R * meta.recordLabel, 64), photoMat(canvases.label, { tint: [0.9, 0.88, 0.85] }));
  label.rotation.x = -Math.PI / 2; label.position.y = 0.0005; label.renderOrder = 2; spin.add(label);
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 12), dark(0.6)); spindle.position.y = 0.006; spin.add(spindle);
  // tonearm
  const metal = photoMat(tex.desk, { tint: [1.6, 1.58, 1.55], transparent: false, self: 0.3 });
  const armBase = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.03, 32), dark(0.25)); armBase.position.set(0.165, TH + 0.015, -0.11); tt.add(armBase);
  const arm = new THREE.Group(); arm.position.set(0.165, TH + 0.04, -0.11); tt.add(arm);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.23, 10), metal); tube.rotation.z = Math.PI / 2; tube.position.x = -0.115; arm.add(tube);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.008, 0.018), dark(0.4)); head.position.set(-0.235, -0.006, 0.004); arm.add(head);
  const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 20), dark(0.3)); cw.rotation.z = Math.PI / 2; cw.position.x = 0.035; arm.add(cw);
  arm.rotation.y = -0.62;
  const pitch = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 0.11), dark(0.3)); pitch.position.set(0.19, TH + 0.002, 0.08); tt.add(pitch);
  const ttLed = glow([1, 0.05, 0.02], 0.03, 5.0); ttLed.position.set(-0.2, TH + 0.004, 0.16); tt.add(ttLed);
  tt.add(shadow(TW * 1.3, TD * 1.4));
  objs.quest = { mesh: plinth, group: tt, mats: [recMat, label.material], hover: 0, spin, speed: 0, recCenter: new THREE.Vector3() };

  // ---------- the producer: a real photo, cut out, relit by the lamp (warm, left) and the CRT (cool rim)
  const pm = meta.producer;
  const prodMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: true,
    uniforms: {
      map: { value: tex.producer }, uNeck: { value: pm.neckV }, uBreath: { value: 0 },
      uHover: { value: 0 }, uTexel: { value: new THREE.Vector2(1 / tex.producer.image.width, 1 / tex.producer.image.height) },
      uKey: { value: new THREE.Color(1.0, 0.62, 0.36) }, uRim: { value: new THREE.Color(0.42, 0.62, 1.0) }, uRimI: { value: 1 }, uRimR: { value: tex.producer.image.width > 700 ? 4.5 : 3.0 },
    },
    vertexShader: /* glsl */ `
      uniform float uNeck, uBreath; varying vec2 vUv;
      void main() {
        vUv = uv; vec3 p = position;
        // breathing: the back widens and the shoulders lift a little
        float torso = 1.0 - smoothstep(uNeck - 0.05, uNeck + 0.02, uv.y);
        p.x *= 1.0 + uBreath * 0.003 * torso;
        p.y += uBreath * 0.002 * smoothstep(0.2, uNeck, uv.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform vec2 uTexel; uniform vec3 uKey, uRim; uniform float uHover, uRimI, uRimR;
      varying vec2 vUv;
      float A(vec2 o) { return texture2D(map, vUv + o * uTexel).a; }
      void main() {
        vec4 c = texture2D(map, vUv);
        c.a *= smoothstep(0.0, 0.12, vUv.y);
        if (c.a < 0.01) discard;
        // edge light from the gear in front of them: how much of the neighbourhood is empty, and on which side
        float r = uRimR; vec2 dir = vec2(0.0); float empty = 0.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 0.5236; vec2 o = vec2(cos(a), sin(a));
          float e = 1.0 - A(o * r); empty += e; dir += o * e;
        }
        empty /= 12.0;
        float rim = smoothstep(0.08, 0.5, empty) * c.a * smoothstep(0.5, 0.66, vUv.y);
        float left = clamp(-dir.x * 0.25 + 0.5, 0.0, 1.0);          // left edges face the lamp
        float up = clamp(dir.y * 0.3 + 0.4, 0.0, 1.0);              // shoulders and headphones catch the CRT
        // warm key falls off from the lamp side; the far side drops into the dark
        float key = mix(1.0, 0.35, smoothstep(0.1, 0.95, vUv.x)) * mix(0.55, 1.0, smoothstep(0.15, 0.7, vUv.y));
        vec3 col = c.rgb * uKey * key * 1.15;
        col += c.rgb * vec3(0.10, 0.12, 0.16);                       // a little cool fill from the screen
        col += uRim * rim * up * (1.0 - left * 0.6) * 0.16 * uRimI;
        col += uKey * rim * left * 0.1;
        col *= 1.0 + uHover * 0.55;
        col += vec3(1.0, 0.8, 0.6) * rim * uHover * 0.12;
        gl_FragColor = vec4(col, c.a);
      }`,
  });
  const PA = pm.aspect;
  const producer = new THREE.Mesh(new THREE.PlaneGeometry(PA, 1, 16, 48), prodMat);
  producer.geometry.translate(0, 0.5, 0); producer.renderOrder = 4; scene.add(producer);
  // the chair back hides the lower back and takes a contact shadow
  // a rounded chair back: a squashed capsule, lit from the lamp side like everything else
  const chairGeo = new THREE.CapsuleGeometry(0.2, 0.12, 8, 24); chairGeo.rotateZ(Math.PI / 2); chairGeo.scale(1, 1.05, 0.22);
  const chair = new THREE.Mesh(chairGeo, photoMat(tex.desk, { tint: [0.09, 0.085, 0.085], transparent: false }));
  scene.add(chair);
  const chairShade = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), new THREE.MeshBasicMaterial({
    map: radialTex([[0, "rgba(0,0,0,.75)"], [0.6, "rgba(0,0,0,.35)"], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false }));
  scene.add(chairShade);
  objs.producer = { mesh: producer, mats: [prodMat], hover: 0 };

  // ---------- the crate on the floor
  const crA = tex.crate.image.width / tex.crate.image.height;
  const crate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1 / crA), photoMat(tex.crate, { tint: [0.9, 0.82, 0.74], self: 0.12, edge: 0.16, glow: [1, 0.85, 0.6] }));
  scene.add(crate); objs.crate = { mesh: crate, mats: [crate.material], hover: 0 };

  // ---------- cables
  const cableMat = photoMat(tex.desk, { tint: [0.05, 0.05, 0.05], transparent: false });
  const cables = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), cableMat); scene.add(m); return m; });
  function cable(m, pts) {
    m.geometry.dispose();
    m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 40, 0.0045, 6);
  }

  // ---------- layout for the current aspect ratio
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 30);
  const rig = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50 };
  function layout(aspect) {
    const t = THREE.MathUtils.clamp((aspect - 0.56) / (1.45 - 0.56), 0, 1);
    const P = LAYOUT.P, Lh = LAYOUT.L, v = (k) => L3(P[k], Lh[k], t), s = (k) => lerp(P[k], Lh[k], t);
    rig.pos.set(...v("cam")); rig.look.set(...v("look")); rig.fov = s("fov");
    crt.position.set(...v("crt")); crt.scale.setScalar(s("crtW"));
    speakers[0].position.set(...v("spL")); speakers[1].position.set(...v("spR"));
    lamp.position.set(...v("lamp"));
    lampShadow.position.set(lamp.position.x, 0.0015, lamp.position.z + 0.06);
    const bu = meta.lampBulb; bulb.position.set(lamp.position.x + (bu[0] - 0.5) * LW, bu[1] * LW / lampA, lamp.position.z + 0.04);
    mpc.position.set(...v("mpc")); mpc.rotation.y = s("mpcYaw");
    tt.position.set(...v("tt")); tt.rotation.y = s("ttYaw");
    const w = v("win"); win.position.set(w[0], w[1], -0.995); win.scale.set(w[2], w[3], 1);
    const c = v("cork"); cork.position.set(c[0], c[1], -0.994); cork.scale.set(c[2], c[3], 1);
    const f = v("flyer"); flyer.position.set(f[0], f[1], -0.992); flyer.scale.set(f[2], f[3], 1); flyer.rotation.z = -0.03;
    const dk = v("desk"); desk.scale.x = edge.scale.x = dk[1] - dk[0]; desk.position.x = edge.position.x = (dk[0] + dk[1]) / 2; deskEnd.position.x = dk[1] - 0.02;
    const pr = v("prod"), ph = s("prodH");
    producer.position.set(pr[0], pr[1], pr[2]); producer.scale.set(ph, ph, ph);
    chair.position.set(pr[0] + 0.01, pr[1] + 0.0, pr[2] + 0.07);
    chairShade.position.set(pr[0], pr[1] + 0.2, pr[2] + 0.02);
    crate.position.set(...v("crate")); crate.scale.setScalar(s("crateW")); crate.rotation.x = s("crateTilt");
    const M = mpc.position, T = tt.position, C = crt.position;
    cable(cables[0], [[M.x + 0.1, 0.03, M.z - 0.2], [M.x + 0.14, 0.004, M.z - 0.32], [M.x + 0.05, 0.004, -0.5], [C.x - 0.1, 0.004, -0.88], [C.x - 0.2, 0.15, -0.98]]);
    cable(cables[1], [[T.x + 0.1, 0.03, T.z - 0.17], [T.x + 0.16, 0.004, T.z - 0.3], [T.x + 0.1, 0.004, -0.62], [T.x + 0.2, 0.004, -0.9], [T.x + 0.26, 0.2, -0.99]]);
    cable(cables[2], [[lamp.position.x + 0.3, 0.004, lamp.position.z + 0.02], [lamp.position.x + 0.42, 0.004, -0.6], [C.x - 0.36, 0.004, -0.7], [C.x - 0.42, 0.004, -0.95], [C.x - 0.5, 0.25, -0.99]]);
    cable(cables[3], [[speakers[1].position.x - 0.05, 0.03, speakers[1].position.z - 0.12], [speakers[1].position.x - 0.12, 0.004, -0.93], [speakers[1].position.x - 0.3, 0.004, -0.96], [speakers[1].position.x - 0.36, 0.3, -0.99]]);
    scene.updateMatrixWorld(true);
    // light positions follow the gear
    LIGHTS.pos[0].copy(bulb.position).add(new THREE.Vector3(0.05, 0.02, 0.1));
    LIGHTS.pos[1].copy(objs.orbit.screenLocal).applyMatrix4(crt.matrixWorld).add(new THREE.Vector3(0, 0, 0.18));
    mpcTop.localToWorld(LIGHTS.pos[2].set(-0.06, -0.05, 0.12));
    LIGHTS.pos[3].set(w[0], w[1], -0.7);
    spin.getWorldPosition(objs.quest.recCenter); recMat.uniforms.uCenter.value.copy(objs.quest.recCenter);
  }

  // ---------- per-frame: hover easing, pads, screen, record
  const beat = 60 / 90; // the pads pulse at 90 BPM
  const PATTERN = [[0, 12], [2], [1, 6], [2], [0, 9], [2, 14], [1, 6], [3]];
  let lastStep = -1;
  function update(dt, t, state) {
    for (const [id, o] of Object.entries(objs)) {
      const want = state.hover === id || state.open === id ? 1 : 0;
      o.hover += (want - o.hover) * Math.min(1, dt * 3);
      if (o.mats) for (const m of o.mats) if (m.uniforms.uHover) m.uniforms.uHover.value = o.hover * (state.open === id ? 0.35 : 0.55);
    }
    // CRT
    screenMat.uniforms.uTime.value = reduced ? 20 : t;
    screenMat.uniforms.uHover.value = objs.orbit.hover;
    winMat.uniforms.uTime.value = reduced ? 0 : t;
    const flick = reduced ? 1 : 0.94 + 0.06 * Math.sin(t * 9.1) * Math.sin(t * 3.3);
    LIGHTS.col[1].set(0.3, 0.48, 0.85).multiplyScalar(flick * (1 + objs.orbit.hover * 0.6));
    LIGHTS.col[0].set(1.0, 0.6, 0.3).multiplyScalar(2.1 * (reduced ? 1 : 0.985 + 0.015 * Math.sin(t * 1.3)));
    LIGHTS.col[3].set(0.05, 0.07, 0.12);
    // pads: a quiet loop, brighter when the MPC is under the hand
    const lineOn = Math.max(objs.line.hover, objs.construct.hover, objs.vision.hover);
    const step = Math.floor(t / (beat / 2));
    if (!reduced && step !== lastStep) {
      lastStep = step;
      for (const i of PATTERN[step % PATTERN.length]) pads[i].level = Math.max(pads[i].level, 0.45);
    }
    // the producer holds still apart from a slow breath; no head motion, no lean
    prodMat.uniforms.uBreath.value = reduced ? 0 : Math.sin(t * 2 * Math.PI / 4.6);
    let padLight = 0;
    for (const p of pads) {
      p.level *= Math.exp(-dt * 5.0);
      const base = reduced ? 0.05 : 0.0;
      let I = base + p.level * 0.36 + lineOn * 0.06;
      if (p === padConstruct || p === padVision) {
        const o = p === padConstruct ? objs.construct : objs.vision;
        I = 0.16 + 0.2 * lineOn + o.hover * 1.2 + (reduced ? 0 : 0.08 * Math.sin(t * 1.4 + p.i));
      }
      p.m.uniforms.uI.value = I * 1.6; padLight += I;
    }
    LIGHTS.col[2].set(0.5, 0.25, 0.3).multiplyScalar(padLight * 0.02);
    // record: spins up when hovered or open, slows like a real platter when let go
    const q = objs.quest, want = (state.hover === "quest" || state.open === "quest") && !reduced ? 3.49 : 0;
    q.speed += (want - q.speed) * Math.min(1, dt * (want ? 0.9 : 0.45));
    q.spin.rotation.y -= q.speed * dt;
  }

  // world points to project for hotspots
  const box = new THREE.Box3();
  function corners(id) {
    const o = objs[id]; o.mesh.updateWorldMatrix(true, false);
    if (!o.mesh.geometry.boundingBox) o.mesh.geometry.computeBoundingBox();
    box.copy(o.mesh.geometry.boundingBox).applyMatrix4(o.mesh.matrixWorld);
    if (id === "quest") box.expandByPoint(q3.copy(o.recCenter).add(new THREE.Vector3(0, 0.03, 0)));
    const pts = [];
    for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    return pts;
  }
  const q3 = new THREE.Vector3();
  function center(id, out = new THREE.Vector3()) {
    const o = objs[id];
    if (id === "orbit") return out.copy(o.screenLocal).applyMatrix4(o.group.matrixWorld);
    if (id === "quest") return out.copy(o.recCenter);
    o.mesh.updateWorldMatrix(true, false);
    if (!o.mesh.geometry.boundingBox) o.mesh.geometry.computeBoundingBox();
    return o.mesh.geometry.boundingBox.getCenter(out).applyMatrix4(o.mesh.matrixWorld);
  }
  // which way an object faces, for the push-in: flat gear is seen from above
  function normal(id) {
    if (id === "line" || id === "construct" || id === "vision" || id === "quest") return new THREE.Vector3(0, 1, 0.55).normalize();
    if (id === "producer") return new THREE.Vector3(0.15, 0.35, 1).normalize();
    if (id === "crate") return new THREE.Vector3(0, Math.cos(objs.crate.mesh.rotation.x + Math.PI / 2) * -1, 1).normalize();
    return new THREE.Vector3(0, 0.1, 1).normalize();
  }
  const size = { orbit: 0.3, quest: 0.24, ruckus: 0.2, line: 0.25, construct: 0.25, vision: 0.25, crate: 0.4, producer: 0.3 };

  return { scene, camera, rig, objs, layout, update, corners, center, normal, size, byId };
}
