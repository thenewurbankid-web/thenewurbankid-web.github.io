// usage: node tools/shoot-v2.cjs [base] [only]   screenshots of v2 at 375x812 and 1440x900 into qa/v2/
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://localhost:8792/';
const only = process.argv[3] || '';
const out = __dirname + '/../qa/v2/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const errs = [];
  for (const [w, h, mobile] of [[375, 812, true], [1440, 900, false]]) {
    if (only && !only.includes(String(w))) continue;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${w} ${m.type()}: ${m.text()}`); });
    p.on('pageerror', e => errs.push(`${w} pageerror: ${e.message}`));
    p.on('requestfailed', r => errs.push(`${w} failed: ${r.url()}`));
    await p.goto(base, { waitUntil: 'networkidle' });
    await p.waitForTimeout(6500);
    await p.screenshot({ path: `${out}${w}-room.png` });
    if (!only.includes('room')) {
      // hover / focus each object (keyboard focus shows the same label + glow)
      for (const id of ['producer', 'orbit', 'quest', 'ruckus', 'line', 'crate']) {
        await p.focus(`#hots a[href="#${id}"]`); await p.waitForTimeout(1800);
        await p.screenshot({ path: `${out}${w}-hover-${id}.png` });
      }
      await p.evaluate(() => document.activeElement.blur());
      for (const id of ['producer', 'orbit', 'quest', 'ruckus', 'line', 'construct', 'vision']) {
        await p.evaluate((id) => window.__studio.open(id), id); await p.waitForTimeout(3600);
        await p.screenshot({ path: `${out}${w}-open-${id}.png` });
        await p.keyboard.press('Escape'); await p.waitForTimeout(2600);
      }
      await p.click('#hots a[href="#crate"]', { force: true }); await p.waitForTimeout(3000);
      await p.screenshot({ path: `${out}${w}-crate.png` });
      await p.keyboard.press('ArrowRight'); await p.waitForTimeout(1500);
      await p.keyboard.press('Enter'); await p.waitForTimeout(1800);
      await p.screenshot({ path: `${out}${w}-crate-back.png` });
      await p.keyboard.press('Escape'); await p.waitForTimeout(2600);
      await p.screenshot({ path: `${out}${w}-room-after.png` });
      await p.click('#ver a'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(6000);
      errs.push(`${w} v1 link -> ${p.url()}`);
      await p.screenshot({ path: `${out}${w}-v1-link.png` });
    }
    await ctx.close();
  }
  console.log(errs.join('\n') || 'no console errors');
  await b.close();
})();
