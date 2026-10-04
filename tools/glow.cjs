// The sun must keep glowing (v1), and the lamp, CRT and pads must keep glowing (v2), through everything a visitor
// does: orbiting, zooming, opening and closing worlds, idling, switching tabs, and a stretch of slow frames.
// usage: NODE_PATH=<dir with playwright> node tools/glow.cjs [base]
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.argv[2] || "http://localhost:8796/";
const rows = []; let fails = 0;
const res = (ok, msg) => { rows.push(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) fails++; };
const wait = (p, ms) => p.waitForTimeout(ms);

async function v1(b, w, h, q = "") {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto(base + "v1/" + q, { waitUntil: "networkidle" }); await wait(p, 6500);
  await p.evaluate(() => { window.__tnuk.probe.on = true; });
  const steps = [
    ["idle", async () => wait(p, 3000)],
    ["orbit (held arrows)", async () => { await p.keyboard.down("ArrowRight"); await wait(p, 1500); await p.keyboard.up("ArrowRight"); await p.keyboard.down("w"); await wait(p, 900); await p.keyboard.up("w"); await wait(p, 1500); }],
    ["zoom in and out", async () => { for (let i = 0; i < 4; i++) await p.keyboard.press("+"); await wait(p, 1800); for (let i = 0; i < 7; i++) await p.keyboard.press("-"); await wait(p, 1800); await p.keyboard.press("0"); await wait(p, 2000); }],
    ["open and close worlds", async () => { for (const id of ["orbit", "line"]) { await p.evaluate((id) => window.__tnuk.openBody(id), id); await wait(p, 3000); await p.evaluate(() => window.__tnuk.back()); await wait(p, 3000); } }],
    ["the star's About", async () => { await p.evaluate(() => window.__tnuk.openAbout()); await wait(p, 2600); await p.evaluate(() => window.__tnuk.back()); await wait(p, 2600); }],
    ["switch tabs away and back", async () => { const q = await ctx.newPage(); await q.goto("about:blank"); await q.bringToFront(); await wait(p, 4000); await q.close(); await p.bringToFront(); await wait(p, 3000); }],
    ["a slow stretch (CPU throttled 8x for 7 s)", async () => { await cdp.send("Emulation.setCPUThrottlingRate", { rate: 8 }); await wait(p, 7000); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }); await wait(p, 3000); }],
    ["idle a while", async () => wait(p, 12000)],
  ];
  const t0 = await p.evaluate(() => window.__tnuk.probe.samples.length);
  const marks = [];
  for (const [name, fn] of steps) { const a = await p.evaluate(() => window.__tnuk.probe.samples.length); await fn(); const z = await p.evaluate(() => window.__tnuk.probe.samples.length); marks.push([name, a, z]); }
  const S = await p.evaluate(() => window.__tnuk.probe.samples.map((s) => [s.halo, s.bloom, s.mode, s.r, s.dpr]));
  // baseline: the system view in the first idle step
  const sys = (a, z) => S.slice(a, z).filter((s) => s[2] === "system" && s[3] > 6);
  const base0 = sys(marks[0][1], marks[0][2]).map((s) => s[0]).sort((a, b) => a - b);
  const ref = base0[Math.floor(base0.length / 2)] || 0;
  res(ref > 0.08, `v1 ${w}x${h}${q}: sun halo baseline ${ref.toFixed(3)} (${S.length - t0} frames sampled)`);
  for (const [name, a, z] of marks) {
    const xs = sys(a, z); if (!xs.length) { rows.push(`  --   v1 ${w}x${h}: ${name}: no system-view frames`); continue; }
    const dropped = xs.filter((s) => s[0] < ref * 0.5).length, bloomOff = xs.filter((s) => !s[1]).length;
    const min = Math.min(...xs.map((s) => s[0]));
    res(dropped / xs.length < 0.02 && (q || bloomOff === 0), `v1 ${w}x${h}${q}: ${name}: ${xs.length} frames, min halo ${min.toFixed(3)}, ${dropped} below half, bloom off in ${bloomOff}`);
  }
  res(!errs.length, `v1 ${w}x${h}: console errors ${errs.join(" | ") || "none"}`);
  await ctx.close();
}

async function v2(b, w, h) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto(base, { waitUntil: "networkidle" }); await wait(p, 6500);
  // ten reads over 1.5 s: median for the lamp and the CRT (they flicker a touch), max for the pads (they pulse)
  const probe = async () => {
    const xs = []; for (let i = 0; i < 10; i++) { xs.push(await p.evaluate(() => window.__studio.glow())); await wait(p, 150); }
    const med = (k) => xs.map((x) => x[k]).sort((a, b) => a - b)[5];
    return { lamp: med("lamp"), crt: med("crt"), pads: Math.max(...xs.map((x) => x.pads)) };
  };
  const g0 = await probe();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 8 }); await wait(p, 7000); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }); await wait(p, 2500);
  const q = await ctx.newPage(); await q.bringToFront(); await wait(p, 3000); await q.close(); await p.bringToFront(); await wait(p, 2500);
  await p.evaluate(() => window.__studio.open("orbit")); await wait(p, 3200); await p.keyboard.press("Escape"); await wait(p, 4000);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());   // no keyboard peek: back to the resting view
  await wait(p, 8000);
  const g1 = await probe();
  for (const k of Object.keys(g0)) res(g1[k] >= g0[k] * 0.6, `v2 ${w}x${h}: ${k} glow ${g0[k].toFixed(3)} -> ${g1[k].toFixed(3)} after slow frames, a tab switch and a push-in`);
  res(!errs.length, `v2 ${w}x${h}: console errors ${errs.join(" | ") || "none"}`);
  await ctx.close();
}

(async () => {
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=metal", "--ignore-gpu-blocklist"] });
  const only = process.argv[3] || "";
  if (!only || only.includes("v1")) { await v1(b, 1440, 900); await v1(b, 375, 812); await v1(b, 375, 812, "?q=low"); }
  if (!only || only.includes("v2")) { await v2(b, 1440, 900); }
  await b.close();
  console.log(rows.join("\n")); process.exit(fails ? 1 : 0);
})();
