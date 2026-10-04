// The song showcase, keyboard only: focus the cassette, Enter, then a frame every ~1.4 s across the first 15 s.
// usage: NODE_PATH=<dir with playwright> node tools/song.cjs [base] [width height]
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.argv[2] || "http://localhost:8796/";
const W = +(process.argv[3] || 1440), H = +(process.argv[4] || 900);
const out = __dirname + "/../qa/song/";
require("fs").mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: W < 600 ? 2 : 1, reducedMotion: process.env.REDUCED ? "reduce" : "no-preference" });
  const p = await ctx.newPage(); const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text())); p.on("pageerror", (e) => errs.push(e.message));
  p.on("requestfailed", (r) => errs.push("failed " + r.url()));
  const tag = `${W}${process.env.REDUCED ? "-reduced" : ""}`;
  await p.goto(base, { waitUntil: "networkidle" }); await p.waitForTimeout(6000);
  const audioReq = []; p.on("request", (r) => { if (r.url().includes("/assets/audio/")) audioReq.push(r.url()); });
  for (let i = 0; i < 9; i++) await p.keyboard.press("Tab");          // skip, producer ... vision, cassette
  await p.waitForTimeout(2200);
  const label = await p.evaluate(() => document.activeElement.getAttribute("aria-label"));
  await p.screenshot({ path: `${out}${tag}-00-cassette-focused.png` });
  const before = audioReq.length;
  await p.keyboard.press("Enter");
  const t0 = Date.now(); const log = [];
  const times = [0.6, 1.6, 2.6, 3.4, 4.2, 5.0, 6.0, 7.2, 8.6, 10.0, 11.5, 13.0, 15.0];
  for (const [i, s] of times.entries()) {
    const wait = s * 1000 - (Date.now() - t0); if (wait > 0) await p.waitForTimeout(wait);
    const st = await p.evaluate(() => { const S = window.__studio.song; return { phase: S.phase, playing: S.playing, t: S.audio ? +S.audio.currentTime.toFixed(2) : 0, beats: S.det.count, bass: +S.det.bass.toFixed(2) }; });
    log.push(`${s.toFixed(1)}s ${JSON.stringify(st)}`);
    await p.screenshot({ path: `${out}${tag}-${String(i + 1).padStart(2, "0")}-${s.toFixed(1)}s.png` });
  }
  // controls: Tab into them
  await p.focus("#song-pause"); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}${tag}-controls.png` });
  await p.keyboard.press("Space"); await p.waitForTimeout(800);
  const paused = await p.evaluate(() => window.__studio.song.audio.paused);
  await p.keyboard.press("Space"); await p.waitForTimeout(600);
  const resumed = await p.evaluate(() => !window.__studio.song.audio.paused);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(3000);   // a key hands the camera back
  await p.screenshot({ path: `${out}${tag}-after-key.png` });
  await p.focus("#song-stop"); await p.keyboard.press("Enter"); await p.waitForTimeout(4500);
  const after = await p.evaluate(() => [window.__studio.song.active, window.__studio.song.phase]);
  await p.screenshot({ path: `${out}${tag}-stopped.png` });
  console.log(`focused: ${label}\naudio requested before tap: ${before}, after: ${audioReq.length} (${audioReq.join(", ")})\n${log.join("\n")}\nSpace pause: ${paused}, resume: ${resumed}; after stop: ${after}\nerrors: ${errs.join(" | ") || "none"}`);
  await b.close();
})();
