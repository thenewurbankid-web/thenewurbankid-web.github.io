// Keyboard-only walkthrough of v2 (the studio) and v1 (the star system). No mouse input at all.
// usage: NODE_PATH=<dir with playwright> node tools/keyboard.cjs [base]   -> qa/keyboard/*.png and a report
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.argv[2] || "http://localhost:8792/";
const out = __dirname + "/../qa/keyboard/";
require("fs").mkdirSync(out, { recursive: true });
const log = [];
const ok = (cond, msg) => { log.push(`${cond ? "PASS" : "FAIL"}  ${msg}`); };
const wait = (p, ms) => p.waitForTimeout(ms);
const smooth = (xs) => { // no single step bigger than 3x the median step, and it actually moved
  const d = xs.slice(1).map((v, i) => Math.abs(v - xs[i])); const s = [...d].sort((a, b) => a - b); const med = s[Math.floor(s.length / 2)] || 0;
  return { moved: Math.abs(xs[xs.length - 1] - xs[0]), maxJump: Math.max(...d), med, ok: Math.max(...d) <= Math.max(med * 3.2, 1e-6) && Math.abs(xs[xs.length - 1] - xs[0]) > 1e-3 };
};
async function sample(p, expr, n, gap) { const xs = []; for (let i = 0; i < n; i++) { xs.push(await p.evaluate(expr)); await wait(p, gap); } return xs; }

async function v2(b, w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1 });
  const p = await ctx.newPage(); const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text())); p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(base, { waitUntil: "networkidle" }); await wait(p, 6500);
  const active = () => p.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.id || document.activeElement?.textContent?.trim().slice(0, 30));
  await p.keyboard.press("Tab"); await wait(p, 400);
  ok((await active()) === "skip", `v2 ${w}: first Tab reaches the skip link`);
  await p.screenshot({ path: `${out}v2-${w}-skip.png` });
  const tour = ["producer", "orbit", "quest", "ruckus", "line", "construct", "vision", "cassette", "crate"];
  for (const id of tour) {
    await p.keyboard.press("Tab"); await wait(p, 2200);
    const href = await p.evaluate(() => document.activeElement.getAttribute("href"));
    const said = await p.evaluate(() => document.getElementById("announce").textContent);
    const peek = await p.evaluate(() => window.__studio.peek.id);
    ok(href === `#${id}` && peek === id && said.length > 0, `v2 ${w}: Tab -> ${id} (camera frames it, announced "${said}")`);
    await p.screenshot({ path: `${out}v2-${w}-focus-${id}.png` });
  }
  const corners = [];
  for (let i = 0; i < 3; i++) { await p.keyboard.press("Tab"); await wait(p, 150); corners.push(await active()); }
  ok(corners.join("|").includes("v1") && corners.join("|").toLowerCase().includes("sound"), `v2 ${w}: then the corner controls (${corners.join(", ")})`);
  if (w === 1440) {
    // open and close every panel with Enter / Esc
    for (const id of ["producer", "orbit", "quest", "ruckus", "line", "construct", "vision"]) {
      await p.focus(`#hots a[href="#${id}"]`).catch(() => {}); // focus() is a keyboard-equivalent move, not a click
      await p.keyboard.press("Shift+Tab"); await p.keyboard.press("Tab"); await wait(p, 600);
      await p.keyboard.press("Enter"); await wait(p, 3400);
      const open = await p.evaluate(() => window.__studio.state.open);
      await p.keyboard.press("Tab"); await wait(p, 200);
      const inPanel = await p.evaluate(() => document.getElementById("panel").contains(document.activeElement));
      if (id === "orbit" || id === "line" || id === "producer") await p.screenshot({ path: `${out}v2-${w}-panel-${id}.png` });
      // Tab around the whole panel: focus must stay inside
      let stays = true; for (let i = 0; i < 12; i++) { await p.keyboard.press("Tab"); if (!(await p.evaluate(() => document.getElementById("panel").contains(document.activeElement)))) stays = false; }
      await p.keyboard.press("Escape"); await wait(p, 2600);
      const back = await p.evaluate(() => [window.__studio.state.open, document.activeElement.getAttribute("href")]);
      ok(open === id && inPanel && stays && back[0] === null && back[1] === `#${id}`, `v2 ${w}: Enter opens ${id}, Tab stays in the panel, Esc closes and focus returns`);
    }
    // camera: move focus off the gear (corner link), then hold arrows
    await p.focus("#ver a"); await wait(p, 2500);
    const xs0 = await p.evaluate(() => window.__studio.look.x);
    await p.keyboard.down("ArrowRight");
    const xs = await sample(p, () => window.__studio.camState.look.x, 14, 100);
    await p.keyboard.up("ArrowRight");
    const after = await sample(p, () => window.__studio.camState.look.x, 10, 100);
    const s1 = smooth(xs), s2 = smooth(after);
    ok(s1.ok && xs[xs.length - 1] > xs[0], `v2 ${w}: hold → pans right smoothly (look.x ${xs[0].toFixed(3)} -> ${xs[xs.length - 1].toFixed(3)}, max step ${s1.maxJump.toFixed(4)}, median ${s1.med.toFixed(4)})`);
    ok(s2.maxJump < s1.maxJump * 1.5, `v2 ${w}: after release it eases to a stop (last steps ${after.slice(-3).map((v, i, a) => i ? (v - a[i - 1]).toFixed(4) : "").join(" ")})`);
    await p.keyboard.down("w"); await wait(p, 700); await p.keyboard.up("w"); await wait(p, 900);
    await p.screenshot({ path: `${out}v2-${w}-look-moved.png` });
    const z0 = await p.evaluate(() => window.__studio.camState.pos.z);
    await p.keyboard.press("+"); await p.keyboard.press("+"); await wait(p, 2500);
    const z1 = await p.evaluate(() => window.__studio.camState.pos.z);
    ok(z1 < z0 - 0.05, `v2 ${w}: + steps in (camera z ${z0.toFixed(3)} -> ${z1.toFixed(3)})`);
    await p.keyboard.press("0"); await wait(p, 4500);
    const home = await p.evaluate(() => [window.__studio.look.x, window.__studio.look.y, window.__studio.look.dolly]);
    ok(home.every((v) => Math.abs(v) < 0.02), `v2 ${w}: 0 returns to the starting view (${home.map((v) => v.toFixed(3)).join(", ")}; look.x was ${xs0.toFixed(2)})`);
    // the crate
    await p.focus('#hots a[href="#crate"]'); await p.keyboard.press("Shift+Tab"); await p.keyboard.press("Tab"); await wait(p, 600);
    await p.keyboard.press("Enter"); await wait(p, 3000);
    const cur = () => p.evaluate(() => [...document.querySelectorAll(".rec")].findIndex((r) => r.getAttribute("aria-current") === "true"));
    const c0 = await cur(); await p.keyboard.press("ArrowRight"); await wait(p, 1400); const c1 = await cur();
    await p.keyboard.press("ArrowRight"); await wait(p, 1400); const c2 = await cur();
    await p.keyboard.press("ArrowLeft"); await wait(p, 1400); const c3 = await cur();
    await p.screenshot({ path: `${out}v2-${w}-crate.png` });
    await p.keyboard.press("Enter"); await wait(p, 1600);
    const turned = await p.evaluate(() => document.querySelector('.rec[aria-current="true"]').classList.contains("turned"));
    await p.screenshot({ path: `${out}v2-${w}-crate-turned.png` });
    await p.keyboard.press("Escape"); await wait(p, 2600);
    const backC = await p.evaluate(() => [window.__studio.state.open, document.activeElement.getAttribute("href")]);
    ok(c0 === 0 && c1 === 1 && c2 === 2 && c3 === 1 && turned && backC[0] === null && backC[1] === "#crate", `v2 ${w}: crate opens with Enter, arrows flip (${c0}->${c1}->${c2}->${c3}), Enter turns the sleeve, Esc returns to the crate`);
  }
  // shortcut overlay
  await p.keyboard.press("?"); await wait(p, 400);
  const ov = await p.evaluate(() => !document.getElementById("keys").hidden);
  await p.screenshot({ path: `${out}v2-${w}-shortcuts.png` });
  await p.keyboard.press("Escape"); await wait(p, 300);
  ok(ov && (await p.evaluate(() => document.getElementById("keys").hidden)), `v2 ${w}: ? shows the key list, Esc hides it`);
  ok(!errs.length, `v2 ${w}: no console errors ${errs.join(" | ")}`);
  await ctx.close();
}

async function v1(b, w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1 });
  const p = await ctx.newPage(); const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text())); p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(base + "v1/", { waitUntil: "networkidle" }); await wait(p, 6500);
  await p.keyboard.press("Tab"); await wait(p, 400);
  ok((await p.evaluate(() => document.activeElement.className)) === "skip", `v1 ${w}: first Tab reaches the skip link (to ?list)`);
  await p.screenshot({ path: `${out}v1-${w}-skip.png` });
  const tour = ["orbit", "quest", "ruckus", "line", "construct", "vision", "about"];
  for (const id of tour) {
    await p.keyboard.press("Tab"); await wait(p, 3000);
    const st = await p.evaluate(() => [document.activeElement.getAttribute("href"), window.__tnuk.view.mode, window.__tnuk.view.focus, document.getElementById("announce").textContent]);
    const want = id === "about" ? st[0] === "#about" && st[1] === "system" : st[0] === `#${id}` && st[1] === "peek" && st[2] === id;
    ok(want, `v1 ${w}: Tab -> ${id} (mode ${st[1]}, camera on ${st[2]}, announced "${st[3]}")`);
    await p.screenshot({ path: `${out}v1-${w}-focus-${id}.png` });
  }
  if (w === 1440) {
    // [ and ] step worlds; Enter opens; Tab stays in the panel; Esc backs out one level at a time
    await p.keyboard.press("Escape"); await wait(p, 300);
    for (const id of ["orbit", "quest", "ruckus", "line"]) {
      await p.keyboard.press("]"); await wait(p, 2800);
      const f = await p.evaluate(() => [window.__tnuk.view.mode, window.__tnuk.view.focus, document.activeElement.getAttribute("href")]);
      await p.keyboard.press("Enter"); await wait(p, 2800);
      const o = await p.evaluate(() => [window.__tnuk.view.mode, document.getElementById("panel").contains(document.activeElement)]);
      let stays = true; for (let i = 0; i < 8; i++) { await p.keyboard.press("Tab"); if (!(await p.evaluate(() => document.getElementById("panel").contains(document.activeElement)))) stays = false; }
      if (id === "orbit" || id === "line") await p.screenshot({ path: `${out}v1-${w}-panel-${id}.png` });
      await p.keyboard.press("Escape"); await wait(p, 2000);
      const e1 = await p.evaluate(() => [window.__tnuk.view.mode, document.activeElement.getAttribute("href")]);
      await p.keyboard.press("Escape"); await wait(p, 2600);
      const e2 = await p.evaluate(() => window.__tnuk.view.mode);
      ok(f[0] === "peek" && f[1] === id && f[2] === `#${id}` && o[0] === "world" && o[1] && stays && e1[0] === "peek" && e1[1] === `#${id}` && e2 === "system",
        `v1 ${w}: ] -> ${id}, Enter opens its panel, Tab stays in it, Esc -> ${e1[0]} (focus ${e1[1]}), Esc -> ${e2}`);
      // put focus back on this world so the next ] steps from it
      await p.focus(`.lbl[href="#${id}"]`).catch(() => {});
    }
    // a moon: Esc from its panel goes to its parent's panel
    await p.evaluate(() => document.activeElement.blur());
    await p.focus('.lbl[href="#construct"]'); await p.keyboard.press("Shift+Tab"); await p.keyboard.press("Tab"); await wait(p, 2800);
    await p.keyboard.press("Enter"); await wait(p, 2600);
    await p.keyboard.press("Escape"); await wait(p, 2600);
    const moon = await p.evaluate(() => [window.__tnuk.view.mode, window.__tnuk.view.focus]);
    ok(moon[0] === "world" && moon[1] === "line", `v1 ${w}: Esc from the Construct moon's panel goes up to Line framework (${moon.join(" ")})`);
    await p.keyboard.press("Escape"); await wait(p, 1800); await p.keyboard.press("Escape"); await wait(p, 2600);
    // the star's panel
    await p.focus('.lbl[href="#about"]'); await p.keyboard.press("Shift+Tab"); await p.keyboard.press("Tab"); await wait(p, 1200);
    await p.keyboard.press("Enter"); await wait(p, 2600);
    const ab = await p.evaluate(() => [window.__tnuk.view.mode, document.getElementById("about").contains(document.activeElement)]);
    await p.screenshot({ path: `${out}v1-${w}-panel-about.png` });
    await p.keyboard.press("Escape"); await wait(p, 2600);
    const ab2 = await p.evaluate(() => [window.__tnuk.view.mode, document.activeElement.getAttribute("href")]);
    ok(ab[0] === "about" && ab[1] && ab2[0] === "system" && ab2[1] === "#about", `v1 ${w}: Enter on the star opens About, Esc goes back with focus on the star`);
    // camera orbit with held keys
    await p.evaluate(() => document.activeElement.blur());
    await wait(p, 1500);
    await p.keyboard.down("ArrowRight");
    const az = await sample(p, () => window.__tnuk.cam.az, 14, 100);
    await p.keyboard.up("ArrowRight");
    const az2 = await sample(p, () => window.__tnuk.cam.az, 10, 100);
    const s1 = smooth(az);
    ok(s1.ok, `v1 ${w}: hold → orbits smoothly (az ${az[0].toFixed(3)} -> ${az[az.length - 1].toFixed(3)}, max step ${s1.maxJump.toFixed(4)}, median ${s1.med.toFixed(4)})`);
    ok(Math.abs(az2[az2.length - 1] - az2[az2.length - 2]) < Math.abs(az2[1] - az2[0]) + 1e-6, `v1 ${w}: after release it eases to a stop`);
    await p.keyboard.down("s"); await wait(p, 700); await p.keyboard.up("s"); await wait(p, 1200);
    const d0 = await p.evaluate(() => window.__tnuk.cam.dist);
    await p.keyboard.press("+"); await p.keyboard.press("+"); await wait(p, 1500);
    const d1 = await p.evaluate(() => window.__tnuk.cam.dist);
    await p.screenshot({ path: `${out}v1-${w}-orbited-zoomed.png` });
    ok(d1 < d0 * 0.85, `v1 ${w}: + zooms in (dist ${d0.toFixed(1)} -> ${d1.toFixed(1)})`);
    await p.keyboard.press("Home"); await wait(p, 2500);
    const v = await p.evaluate(() => [window.__tnuk.view.userAz, window.__tnuk.view.userEl, window.__tnuk.view.zoom]);
    ok(v[0] === 0 && v[1] === 0 && v[2] === 1, `v1 ${w}: Home recentres`);
  }
  await p.keyboard.press("?"); await wait(p, 400);
  const ov = await p.evaluate(() => !document.getElementById("keys").hidden);
  await p.screenshot({ path: `${out}v1-${w}-shortcuts.png` });
  await p.keyboard.press("Escape"); await wait(p, 300);
  ok(ov && (await p.evaluate(() => document.getElementById("keys").hidden)), `v1 ${w}: ? shows the key list, Esc hides it`);
  ok(!errs.length, `v1 ${w}: no console errors ${errs.join(" | ")}`);
  await ctx.close();
}

(async () => {
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=metal", "--ignore-gpu-blocklist"] });
  const only = process.argv[3] || "";
  if (!only || only.includes("v2")) { await v2(b, 1440, 900, false); await v2(b, 375, 812, true); }
  if (!only || only.includes("v1")) { await v1(b, 1440, 900, false); await v1(b, 375, 812, true); }
  // reduced motion: keys step instantly
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p = await ctx.newPage(); await p.goto(base, { waitUntil: "networkidle" }); await wait(p, 2500);
  await p.focus("#ver a"); await wait(p, 300);
  const a = await p.evaluate(() => window.__studio.camState.look.x); await p.keyboard.press("ArrowRight"); await wait(p, 120);
  const bb = await p.evaluate(() => window.__studio.camState.look.x);
  ok(Math.abs(bb - a) > 0.05, `v2 reduced motion: one arrow press moves the view at once (${a.toFixed(3)} -> ${bb.toFixed(3)})`);
  await ctx.close();
  await b.close();
  console.log(log.join("\n"));
  require("fs").writeFileSync(out + "report.txt", log.join("\n") + "\n");
})();
