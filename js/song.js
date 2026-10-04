// The song on the tape: lazy-loaded audio, beat and energy from an AnalyserNode, and the camera choreography
// (push in on the cassette, track to the boombox, hold, pull back on the first strong beat, drift with the bars).
import * as THREE from "three";
import { music } from "./room.js";
import { SONG } from "./paper.js";

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const UP = new THREE.Vector3(0, 1, 0);

export function makeSong({ room, rig, reduced, getRest, camera, onChange }) {
  const R = room.song;
  let audio = null, ctx = null, analyser = null, gain = null, freq = null, time = null;
  let active = false, phase = "idle", t0 = 0, now = 0, playing = false, muted = false, volume = 0.85;
  let shots = null, tPull = 0, pullFrom = null, endT = 0, overrideT = -99, w = 1;
  const det = { bass: 0, avg: 0.2, lo: 1, hi: 0, flux: 0, fluxAvg: 0.02, prev: null, last: -1, count: 0, bar: 0, short: 0, long: 0, loud: 0, firstStrong: false };

  // ---------------------------------------------------------------- the controls (white on black, text only)
  const ui = document.createElement("div");
  ui.id = "song-ui"; ui.hidden = true; ui.setAttribute("role", "group"); ui.setAttribute("aria-label", "Now playing");
  ui.innerHTML = `<p class="now"><span class="t">${SONG.title}</span> <span class="a">${SONG.artist} · ${SONG.credit}</span></p>
    <p class="ctl mono"><a href="#" role="button" id="song-pause">pause</a> <a href="#" role="button" id="song-stop">stop</a>
    <label>vol <input id="song-vol" type="range" min="0" max="1" step="0.05" value="${volume}" aria-label="Volume"></label> <span id="song-time" aria-hidden="true"></span></p>`;
  document.body.appendChild(ui);
  const pauseBtn = ui.querySelector("#song-pause"), timeEl = ui.querySelector("#song-time");
  pauseBtn.addEventListener("click", (e) => { e.preventDefault(); toggle(); });
  ui.querySelector("#song-stop").addEventListener("click", (e) => { e.preventDefault(); stop(); });
  ui.querySelector("#song-vol").addEventListener("input", (e) => { volume = +e.target.value; applyGain(); });

  function applyGain() { if (gain) gain.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05); }
  function load() {
    if (audio) return;
    audio = new Audio();
    audio.preload = "auto";
    audio.src = audio.canPlayType('audio/webm; codecs="opus"') ? "assets/audio/song.webm" : "assets/audio/song.mp3";
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.55;
    gain = ctx.createGain(); gain.gain.value = muted ? 0 : volume;
    src.connect(analyser);                 // analysis before the volume, so the room still grooves when it is quiet
    src.connect(gain).connect(ctx.destination);
    freq = new Uint8Array(analyser.frequencyBinCount); time = new Uint8Array(analyser.fftSize);
    audio.addEventListener("ended", () => finish());
  }

  // ---------------------------------------------------------------- shots
  const v = () => new THREE.Vector3();
  function makeShots() {
    const portrait = camera.aspect < 1, rest = getRest();
    const c = R.cas.getWorldPosition(v()).add(new THREE.Vector3(0, 0.01, 0));
    const toCam = rest.pos.clone().sub(c).setY(0).normalize();
    const casShot = { pos: c.clone().addScaledVector(toCam, portrait ? 0.2 : 0.17).add(new THREE.Vector3(0, portrait ? 0.3 : 0.22, 0)), look: c.clone(), fov: rig.fov * (portrait ? 0.6 : 0.58) };
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(R.boom.quaternion);
    const door = R.boom.localToWorld(R.doorLocal());
    const doorShot = { pos: door.clone().addScaledVector(n, portrait ? 0.34 : 0.26).add(new THREE.Vector3(0, 0.04, 0)), look: door.clone(), fov: rig.fov * (portrait ? 0.62 : 0.55) };
    const bc = R.boom.localToWorld(new THREE.Vector3(0, 0.5 / 1.6, 0));
    const boomShot = { pos: bc.clone().addScaledVector(n, portrait ? 1.0 : 0.62).add(new THREE.Vector3(0, 0.1, 0)), look: bc.clone(), fov: rig.fov * (portrait ? 0.7 : 0.62) };
    for (const s of [casShot, doorShot, boomShot]) s.focus = s.pos.distanceTo(s.look);
    return { casShot, doorShot, boomShot, door, n, bc };
  }
  const casQuatEnd = () => R.boom.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));

  // ---------------------------------------------------------------- start / pause / stop
  function start() {
    if (active) return toggle();
    load(); if (ctx.state === "suspended") ctx.resume();
    active = true; phase = "intro"; t0 = now; playing = false; det.firstStrong = false; det.count = 0;
    shots = makeShots(); w = 1; overrideT = -99;
    R.boomMat.uniforms.uDoorMix.value = 0; R.boomMat.uniforms.uPlayDown.value = 0;
    document.body.classList.add("song-intro");
    ui.hidden = false; requestAnimationFrame(() => ui.classList.add("in"));
    onChange("start");
  }
  function pressPlay() {
    R.boomMat.uniforms.uPlayDown.value = 1; R.boomMat.uniforms.uLed.value = 1;
    const go = () => audio.play().then(() => { playing = true; pauseBtn.textContent = "pause"; onChange("play"); }).catch(() => {});
    if (audio.readyState >= 3) go(); else audio.addEventListener("canplay", go, { once: true });
  }
  function toggle() {
    if (!active || !audio) return;
    if (phase === "intro" && !playing) return;
    if (audio.paused) { audio.play(); playing = true; pauseBtn.textContent = "pause"; R.boomMat.uniforms.uPlayDown.value = 1; onChange("play"); }
    else { audio.pause(); playing = false; pauseBtn.textContent = "resume"; R.boomMat.uniforms.uPlayDown.value = 0; onChange("pause"); }
  }
  function finish() { if (!active) return; playing = false; phase = "end"; endT = now; onChange("end"); }
  function stop() {
    if (!active) return;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    finish();
  }
  function reset() {
    active = false; phase = "idle"; playing = false;
    R.cas.visible = true; R.cas.position.copy(R.casHome.pos); R.cas.quaternion.copy(R.casHome.quat);
    R.boomMat.uniforms.uDoorMix.value = 0; R.boomMat.uniforms.uPlayDown.value = 0; R.boomMat.uniforms.uLed.value = 0;
    if (audio) audio.currentTime = 0;
    document.body.classList.remove("song-intro");
    ui.classList.remove("in"); setTimeout(() => { if (!active) ui.hidden = true; }, 700);
    onChange("idle");
  }

  // ---------------------------------------------------------------- per frame: analysis
  function analyse(dt) {
    if (!analyser || !playing) {
      music.on += (0 - music.on) * Math.min(1, dt * 1.2); music.bass *= Math.exp(-dt * 4); music.beat *= Math.exp(-dt * 4);
      return;
    }
    analyser.getByteFrequencyData(freq); analyser.getByteTimeDomainData(time);
    let b = 0; for (let i = 1; i <= 5; i++) b += freq[i]; b /= 5 * 255;
    // onsets from spectral flux in the low end (robust when the bass sits near full scale)
    if (!det.prev) det.prev = new Uint8Array(freq.length);
    let fl = 0; for (let i = 1; i <= 10; i++) fl += Math.max(0, freq[i] - det.prev[i]); fl /= 10 * 255; det.prev.set(freq);
    det.flux = fl; det.fluxAvg += (fl - det.fluxAvg) * Math.min(1, dt / 0.8);
    // a running range for the bass, so the cones move with the music rather than sit at full throw
    det.lo = Math.min(b, det.lo + dt * 0.08); det.hi = Math.max(b, det.hi - dt * 0.08);
    const norm = Math.max(0, Math.min(1, (b - det.lo) / Math.max(0.05, det.hi - det.lo)));
    det.bass = norm > det.bass ? norm : det.bass + (norm - det.bass) * Math.min(1, dt * 9);
    det.avg += (b - det.avg) * Math.min(1, dt / 1.2);
    let rms = 0; for (let i = 0; i < time.length; i += 4) { const x = (time[i] - 128) / 128; rms += x * x; } rms = Math.sqrt(rms / (time.length / 4));
    det.short += (rms - det.short) * Math.min(1, dt / 1.0); det.long += (rms - det.long) * Math.min(1, dt / 10);
    const T = audio.currentTime;
    if (fl > det.fluxAvg * 1.6 + 0.012 && b > 0.15 && T - det.last > 0.28) {
      det.last = T; det.count++; music.beatHit = true; music.beat = 1;
      if (det.count % 4 === 0) det.bar = 1;
      if (fl > det.fluxAvg * 2.2 + 0.02 && T > 0.4) det.firstStrong = true;
    }
    det.bar *= Math.exp(-dt * 1.6);
    det.loud += ((T > 12 && det.short > det.long * 1.15 ? 1 : 0) - det.loud) * Math.min(1, dt * 0.35);
    music.on += (1 - music.on) * Math.min(1, dt * 2);
    music.bass = Math.pow(det.bass, 1.6);
    music.beat *= Math.exp(-dt * 5);
    music.level = det.short;
    for (let i = 0; i < 256; i++) { music.waveData[i] = time[i * 4]; music.waveData[256 + i] = freq[Math.min(freq.length - 1, i)]; }
    const m = Math.floor(audio.currentTime / 60), s = Math.floor(audio.currentTime % 60);
    timeEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
  }

  // ---------------------------------------------------------------- per frame: the director
  // returns the shot the camera should take, or null to leave the camera to the room
  function director(dt, t) {
    now = t; analyse(dt);
    if (!active) return null;
    const T = t - t0, U = R.boomMat.uniforms;
    if (reduced) {           // static framing with crossfades only
      const fade = T < 0.5 ? 1 - T / 0.5 : T < 1.0 ? (T - 0.5) / 0.5 : T < 2.6 ? 1 : T < 3.1 ? 1 - (T - 2.6) / 0.5 : T < 3.6 ? (T - 3.1) / 0.5 : 1;
      if (T >= 0.5 && phase === "intro") { R.cas.visible = false; U.uDoorMix.value = 1; if (T >= 1.0 && !U.uPlayDown.value) pressPlay(); }
      if (T >= 3.1 && phase === "intro") { phase = "groove"; document.body.classList.remove("song-intro"); }
      if (phase === "end" && t - endT > 1.5) reset();
      if (T >= 0.5 && T < 3.1) return { ...shots.boomShot, k: 1, aperture: 2.6, blurAll: 0, fade };
      return T < 3.6 ? { ...getRest(), k: 1, focus: null, aperture: null, blurAll: 0, fade } : null;
    }
    if (phase === "intro") {
      const { casShot, doorShot, boomShot } = shots;
      if (T < 2.4) {                                   // 1. a slow push and tilt down onto the cassette
        if (!shots.from) shots.from = { ...getRestNow(), focus: null };
        const e = ease(T / 2.4);
        return mixShot(shots.from, casShot, e, { aperture: 1 + 2.2 * e, focusFrom: shots.from.focus ?? casShot.focus * 4 });
      }
      if (T < 5.6) {                                   // 2. pick-up: track across the desk to the boombox; rack focus hides the cut
        const u = (T - 2.4) / 3.2, e = ease(u);
        const mid = casShot.pos.clone().lerp(doorShot.pos, 0.5).add(new THREE.Vector3(0, 0.12, 0)).addScaledVector(shots.n, 0.12);
        const pos = quad(casShot.pos, mid, doorShot.pos, e), look = casShot.look.clone().lerp(doorShot.look, ease(smooth(0.05, 0.9, u)));
        moveCassette(smooth(0.12, 0.88, u));
        if (u > 0.9) U.uDoorMix.value = Math.min(1, U.uDoorMix.value + dt * 3);
        return { pos, look, fov: THREE.MathUtils.lerp(casShot.fov, doorShot.fov, e), focus: THREE.MathUtils.lerp(casShot.focus, doorShot.focus, e), aperture: 3.2, blurAll: Math.pow(Math.sin(Math.PI * u), 2) * 3.2, k: 1 };
      }
      R.cas.visible = false; U.uDoorMix.value = 1;
      if (T < 7.0) {                                   // 3. ease back to see the whole boombox; play goes down
        const e = ease((T - 5.6) / 1.4);
        if (T > 6.2 && !U.uPlayDown.value) pressPlay();
        return mixShot(doorShot, boomShot, e, { aperture: 2.6 });
      }
      // hold on the close-up until the first strong beat (or a few seconds), then pull back
      if (!U.uPlayDown.value) pressPlay();
      if ((playing && det.firstStrong) || T > 11) { phase = "pull"; tPull = t; pullFrom = boomShot; document.body.classList.remove("song-intro"); onChange("groove"); }
      return { ...boomShot, aperture: 2.6, blurAll: 0, k: 1 };
    }
    // groove: the rest view, drifting with the music; any input hands the camera back for a while
    const idle = t - overrideT;
    w += ((idle < 4 ? 0 : 1) - w) * Math.min(1, dt * (idle < 4 ? 5 : 0.6));
    if (phase === "end") w *= Math.exp(-dt * 0.9);
    const rest = getRest(), g = grooveShot(rest, t);
    let out = mixShot(rest, g, w, {});
    if (phase === "pull") {                            // 4. slow pull-back with a slight orbit to reveal the room
      const u = (t - tPull) / 5.5, e = ease(u);
      if (u >= 1) phase = "groove";
      const orbit = orbitAbout(out.pos, out.look, (1 - e) * 0.16);
      out = mixShot(pullFrom, { ...out, pos: orbit }, e, { aperture: THREE.MathUtils.lerp(2.6, 0.9, e) });
      out.focus = THREE.MathUtils.lerp(pullFrom.focus, out.pos.distanceTo(rest.look) * 0.74, e);
      return { ...out, k: 1 };
    }
    if (phase === "end" && t - endT > 3.5) { reset(); return null; }
    return { ...out, focus: null, aperture: null, blurAll: 0, k: 1 - Math.exp(-dt * 3) };
  }
  function getRestNow() { return { pos: camera.position.clone(), look: camera.position.clone().add(camera.getWorldDirection(v())), fov: camera.fov }; }
  function grooveShot(rest, t) {
    const look = rest.look.clone(); let pos = rest.pos.clone();
    pos = orbitAbout(pos, look, 0.05 * Math.sin((t - t0) * Math.PI * 2 / 26));          // a gentle orbit
    pos.lerp(look, 0.035 * det.bar);                                                        // a tiny push on each bar
    pos.lerp(shots.bc, 0.12 * det.loud); look.lerp(shots.bc, 0.22 * det.loud);              // toward the speakers when it is loudest
    return { pos, look, fov: rest.fov * (1 - 0.03 * det.loud) };
  }
  function orbitAbout(pos, look, a) { return pos.clone().sub(look).applyAxisAngle(UP, a).add(look); }
  function quad(a, b, c, t) { const ab = a.clone().lerp(b, t), bc = b.clone().lerp(c, t); return ab.lerp(bc, t); }
  function mixShot(a, b, e, o) {
    const out = { pos: a.pos.clone().lerp(b.pos, e), look: a.look.clone().lerp(b.look, e), fov: THREE.MathUtils.lerp(a.fov, b.fov, e), k: 1, blurAll: 0 };
    const fa = o.focusFrom ?? a.focus, fb = b.focus;
    out.focus = fa != null && fb != null ? THREE.MathUtils.lerp(fa, fb, e) : fb ?? null;
    out.aperture = o.aperture ?? null;
    return out;
  }
  function moveCassette(u) {
    const e = ease(u), home = R.casHome.pos, end = shots.door.clone().addScaledVector(shots.n, 0.012);
    const mid = home.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.16, 0)).addScaledVector(shots.n, 0.1);
    R.cas.position.copy(quad(home, mid, end, e));
    R.cas.quaternion.copy(R.casHome.quat).slerp(casQuatEnd(), ease(smooth(0.1, 0.8, u)));
    R.cas.visible = u < 0.995;
  }

  return {
    start, toggle, stop,
    director,
    poke(t) { if (active && phase !== "intro") overrideT = t; },
    setMuted(m) { muted = m; applyGain(); },
    get active() { return active; },
    get phase() { return phase; },
    get playing() { return playing; },
    get intro() { return active && phase === "intro"; },
    get audio() { return audio; },
    det,
  };
}
