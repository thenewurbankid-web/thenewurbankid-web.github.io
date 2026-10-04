// The film camera: depth of field, bloom with a warm halation, grade, grain and vignette.
// Plain render targets and full-screen triangles; no EffectComposer.
import * as THREE from "three";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT = /* glsl */ `
uniform sampler2D tSrc; uniform float uThresh; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(uThresh, uThresh + 0.6, l), 1.0);
}`;

const BLUR = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 0.227;
  s += texture2D(tSrc, vUv + uDir * 1.385).rgb * 0.316; s += texture2D(tSrc, vUv - uDir * 1.385).rgb * 0.316;
  s += texture2D(tSrc, vUv + uDir * 3.231).rgb * 0.070; s += texture2D(tSrc, vUv - uDir * 3.231).rgb * 0.070;
  gl_FragColor = vec4(s, 1.0);
}`;

const FINAL = /* glsl */ `
uniform sampler2D tScene, tDepth, tBloomA, tBloomB;
uniform vec2 uRes; uniform float uNear, uFar, uFocus, uAperture, uMaxBlur, uBlurAll;
uniform float uTime, uFade, uExposure, uGrainAmt, uLeak, uBloom;
uniform vec2 uLeakPos;
varying vec2 vUv;
#ifndef TAPS
#define TAPS 16
#endif
float linDepth(float z) { float n = z * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - n * (uFar - uNear)); }
float coc(vec2 uv) {
  float d = linDepth(texture2D(tDepth, uv).x);
  return min(abs(d - uFocus) / max(d, 0.001) * uAperture, 1.0) * uMaxBlur + uBlurAll;
}
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  // lens blur: golden-angle disc, weighted so sharp things do not bleed onto blurred ones
  float c0 = coc(vUv);
  vec3 acc = texture2D(tScene, vUv).rgb; float wsum = 1.0;
  if (c0 > 0.6) {
    for (int i = 0; i < TAPS; i++) {
      float fi = float(i) + 0.5;
      float r = sqrt(fi / float(TAPS));
      float a = fi * 2.39996;
      vec2 o = vec2(cos(a), sin(a)) * r * c0 / uRes;
      float ci = coc(vUv + o);
      float w = smoothstep(0.0, 1.0, ci / max(c0 * r, 0.001) + 0.15);
      acc += texture2D(tScene, vUv + o).rgb * w; wsum += w;
    }
  }
  vec3 col = acc / wsum;
  // bloom with a warm halation, as film does around bright sources
  vec3 b = texture2D(tBloomA, vUv).rgb * 0.6 + texture2D(tBloomB, vUv).rgb * 0.9;
  col += b * vec3(1.0, 0.62, 0.42) * uBloom + b * 0.25 * uBloom;
  // light leak drifting off the lamp side
  vec2 lp = uLeakPos + vec2(sin(uTime * 0.05) * 0.06, cos(uTime * 0.037) * 0.05);
  float leak = exp(-dot((vUv - lp) * vec2(1.4, 1.0), (vUv - lp) * vec2(1.4, 1.0)) * 5.0);
  col += vec3(1.0, 0.45, 0.2) * leak * uLeak;
  col *= uExposure;
  col = aces(col);
  col = pow(col, vec3(1.0 / 2.2));
  // film grade: lifted, slightly green-teal shadows, warm highlights, a touch less saturation
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 0.86);
  col += vec3(-0.004, 0.012, 0.02) * (1.0 - smoothstep(0.0, 0.45, l));
  col *= mix(vec3(1.0), vec3(1.05, 1.0, 0.92), smoothstep(0.35, 1.0, l));
  col = col * 0.95 + 0.018;
  // vignette and grain
  vec2 q = vUv - 0.5;
  col *= 1.0 - smoothstep(0.25, 0.95, length(q * vec2(uRes.x / uRes.y, 1.0) * 0.9)) * 0.62;
  float g = hash(vUv * uRes + fract(uTime * 7.31) * 113.0) - 0.5;
  col += g * uGrainAmt * (1.0 - l * 0.6);
  gl_FragColor = vec4(col * uFade, 1.0);
}`;

export class Film {
  constructor(renderer, { phone }) {
    this.r = renderer;
    this.phone = phone;
    this.tri = new THREE.BufferGeometry();
    this.tri.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const rt = (w, h, depth) => {
      const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: !!depth });
      if (depth) t.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
      return t;
    };
    this.scene = rt(4, 4, true);
    this.bA = rt(4, 4); this.bB = rt(4, 4); this.bC = rt(4, 4); this.bD = rt(4, 4);
    this.mk = (frag, uniforms, defines) => {
      const m = new THREE.Mesh(this.tri, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines: defines || {}, depthTest: false, depthWrite: false }));
      m.frustumCulled = false; const s = new THREE.Scene(); s.add(m); return { m, s, u: uniforms };
    };
    this.bright = this.mk(BRIGHT, { tSrc: { value: null }, uThresh: { value: 0.9 } });
    this.blur = this.mk(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.final = this.mk(FINAL, {
      tScene: { value: this.scene.texture }, tDepth: { value: this.scene.depthTexture },
      tBloomA: { value: this.bB.texture }, tBloomB: { value: this.bD.texture },
      uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.05 }, uFar: { value: 30 },
      uFocus: { value: 2.5 }, uAperture: { value: 1.0 }, uMaxBlur: { value: 10 }, uBlurAll: { value: 0 },
      uTime: { value: 0 }, uFade: { value: 1 }, uExposure: { value: 1 }, uGrainAmt: { value: 0.07 },
      uLeak: { value: 0.05 }, uLeakPos: { value: new THREE.Vector2(0.05, 0.75) }, uBloom: { value: 0.9 },
    }, { TAPS: phone ? 12 : 18 });
    this.u = this.final.u;
  }
  setSize(w, h, dpr) {
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    this.scene.setSize(W, H);
    const qw = Math.max(2, W >> 2), qh = Math.max(2, H >> 2);
    this.bA.setSize(qw, qh); this.bB.setSize(qw, qh);
    this.bC.setSize(qw >> 1, qh >> 1); this.bD.setSize(qw >> 1, qh >> 1);
    this.u.uRes.value.set(W, H);
    this.dpr = dpr;
  }
  pass(p, target) { this.r.setRenderTarget(target); this.r.render(p.s, this.cam); }
  blurPass(src, dst, tmp, w, h, k) {
    this.blur.u.tSrc.value = src.texture; this.blur.u.uDir.value.set(k / w, 0); this.pass(this.blur, tmp);
    this.blur.u.tSrc.value = tmp.texture; this.blur.u.uDir.value.set(0, k / h); this.pass(this.blur, dst);
  }
  render(scene, camera) {
    this.u.uNear.value = camera.near; this.u.uFar.value = camera.far;
    this.r.setRenderTarget(this.scene); this.r.clear(); this.r.render(scene, camera);
    this.bright.u.tSrc.value = this.scene.texture; this.pass(this.bright, this.bA);
    const { width: qw, height: qh } = this.bA;
    this.blurPass(this.bA, this.bB, this.bC, qw, qh, 1.0);      // bB: tight bloom (bC used as temp)
    this.blurPass(this.bB, this.bD, this.bC, qw >> 1, qh >> 1, 2.2); // bD: wide halation, at eighth size
    this.r.setRenderTarget(null); this.r.render(this.final.s, this.cam);
  }
}
