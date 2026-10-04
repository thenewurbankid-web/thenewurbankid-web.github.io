// The producer must not hide the gear: for each focusable object, open it (and Tab-focus it), then project the
// producer's box and the object's box at the camera pose and check the overlap. 1440x900 and 375x812.
// usage: NODE_PATH=<dir with playwright> node tools/occlusion.cjs [base]
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.argv[2] || "http://localhost:8796/";
const out = __dirname + "/../qa/occlusion/";
require("fs").mkdirSync(out, { recursive: true });
const IDS = ["orbit", "quest", "ruckus", "line", "construct", "vision", "crate"];
const MARGIN = 0.03;
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=metal", "--ignore-gpu-blocklist"] });
  const rows = []; let fails = 0;
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 600 ? 2 : 1 });
    const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await p.goto(base, { waitUntil: "networkidle" }); await p.waitForTimeout(6000);
    for (const id of IDS) {   // opened (push-in)
      await p.evaluate((id) => window.__studio.open(id), id); await p.waitForTimeout(3800);
      const o = await p.evaluate((id) => window.__studio.occlusion(id), id);
      const ok = o <= MARGIN; if (!ok) fails++;
      rows.push(`${ok ? "PASS" : "FAIL"}  ${w}x${h} open ${id}: producer covers ${(o * 100).toFixed(1)}% of it`);
      await p.screenshot({ path: `${out}${w}-open-${id}.png` });
      await p.keyboard.press("Escape"); await p.waitForTimeout(2600);
    }
    // Tab tour framing
    await p.focus("#skip");                // start of the Tab order (focus() moves focus without a click)
    await p.keyboard.press("Tab"); // producer
    for (const id of [...IDS.slice(0, -1), "cassette", "crate"]) {
      await p.keyboard.press("Tab"); await p.waitForTimeout(3600);
      const href = await p.evaluate(() => document.activeElement.getAttribute("href"));
      const o = await p.evaluate((id) => window.__studio.occlusion(id), id);
      const fade = await p.evaluate(() => window.__studio.producerFade);
      const ok = href === `#${id}` && (o <= MARGIN || fade < 0.35); if (!ok) fails++;
      rows.push(`${ok ? "PASS" : "FAIL"}  ${w}x${h} Tab ${id}: producer covers ${(o * 100).toFixed(1)}%${o > MARGIN ? `, faded to ${fade.toFixed(2)}` : ""}`);
      await p.screenshot({ path: `${out}${w}-tab-${id}.png` });
    }
    // the song's opening shots: back to the cassette, Enter
    await p.keyboard.press("Shift+Tab"); await p.waitForTimeout(400);
    await p.keyboard.press("Enter");
    for (const [s, id] of [[2.4, "cassette"], [7.0, "boombox"]]) {
      await p.waitForTimeout(s === 2.4 ? 2400 : 4600);
      const o = await p.evaluate((id) => window.__studio.occlusion(id), id), fade = await p.evaluate(() => window.__studio.producerFade);
      const ok = o <= MARGIN || fade < 0.35; if (!ok) fails++;
      rows.push(`${ok ? "PASS" : "FAIL"}  ${w}x${h} song shot at ${s}s on the ${id}: producer covers ${(o * 100).toFixed(1)}%${o > MARGIN ? `, faded to ${fade.toFixed(2)}` : ""}`);
      await p.screenshot({ path: `${out}${w}-song-${id}.png` });
    }
    await p.evaluate(() => window.__studio.song.stop());
    rows.push(`${errs.length ? "FAIL" : "PASS"}  ${w}x${h} console errors: ${errs.join(" | ") || "none"}`); if (errs.length) fails++;
    await ctx.close();
  }
  await b.close();
  console.log(rows.join("\n")); require("fs").writeFileSync(out + "report.txt", rows.join("\n") + "\n");
  process.exit(fails ? 1 : 0);
})();
