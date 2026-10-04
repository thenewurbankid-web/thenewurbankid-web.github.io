// Optional room tone: a quiet vinyl crackle and a low hum, synthesised (no audio files). Off by default.
export function makeSound() {
  let ctx = null, master = null;
  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    // crackle: sparse clicks and a soft hiss, run through a band-pass like an old cartridge
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w;
      d[i] = b * 0.5 + (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : 0) + (Math.random() < 0.00006 ? (Math.random() * 2 - 1) * 1.6 : 0);
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 0.5;
    const cg = ctx.createGain(); cg.gain.value = 0.22;
    src.connect(bp).connect(cg).connect(master); src.start();
    // hum of the room
    const hum = ctx.createOscillator(); hum.frequency.value = 55; const hg = ctx.createGain(); hg.gain.value = 0.012;
    hum.connect(hg).connect(master); hum.start();
  }
  let on = false, ducked = false;
  const level = () => (on && !ducked ? 0.5 : 0);
  return {
    toggle() {
      if (!ctx) build();
      on = !on;
      if (ctx.state === "suspended") ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(level(), ctx.currentTime, 0.6);
      return on;
    },
    duck(d) { ducked = d; if (ctx) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.4); },
    get on() { return on; },
  };
}
