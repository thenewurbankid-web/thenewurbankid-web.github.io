// usage: node shoot-v1.cjs <baseUrl> <prefix>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const [base, prefix] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  const errs = [];
  for (const [w, h] of [[375, 812], [1440, 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('console', m => m.type() === 'error' && errs.push(`${w}: ${m.text()}`));
    p.on('pageerror', e => errs.push(`${w}: ${e.message}`));
    await p.goto(base, { waitUntil: 'networkidle' }); await p.waitForTimeout(8500);
    await p.screenshot({ path: `${__dirname}/../qa/v2/${prefix}-${w}-title.png` });
    await p.goto(base + '#ruckus', { waitUntil: 'networkidle' }); await p.reload(); await p.waitForTimeout(8500);
    await p.screenshot({ path: `${__dirname}/../qa/v2/${prefix}-${w}-ruckus.png` });
    await p.close();
  }
  console.log(errs.length ? errs.join('\n') : 'no console errors');
  await b.close();
})();
