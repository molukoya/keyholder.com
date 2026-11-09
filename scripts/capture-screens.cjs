// Retakes the app screenshots used in the website's "Take a closer look" tour.
//
//   npm run build && npx vite preview --port 4173 &
//   npm run screens
//
// Each screen is captured in a Mac-size window (1440 x 900) at Retina sharpness, using the sample
// properties, then saved as WebP (1600 px wide) in src/assets/screens/. The position of the key button
// on each screen is saved to src/assets/screens/hotspots.json (percent of the screen), for the tour's
// highlight (left, top, width and height of the button, in percent).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const OUT = path.join(__dirname, '..', 'src', 'assets', 'screens');
const W = 1440, H = 900, OUT_W = 1600, QUALITY = 0.8;
// Hide preview-only chrome and freeze motion so every shot is clean and repeatable.
const HIDE = '.sample-banner,.tour,.toasts{display:none!important} *,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}';

const lateOptions = async (pg) => { await pg.locator('.unit-row', { hasText: 'Jordan' }).locator('text=Late rent options').click(); await pg.waitForSelector('.drawer'); };
const SHOTS = [
  { id: 'rent', route: 'today', target: '.rent-row:has-text("Maya") .row-act .btn' },
  { id: 'receipt', route: 'paperwork/income', open: async (pg) => { await pg.locator('table.ledger button.btn', { hasText: '#' }).first().click(); await pg.waitForSelector('.drawer .letter'); }, target: '.drawer .letter .stamp' },
  { id: 'reminder', route: 'rentals', open: async (pg) => { await lateOptions(pg); await pg.locator('.drawer >> text=Write reminder').click(); await pg.waitForSelector('.drawer-foot >> text=Send now'); await pg.locator('.drawer button', { hasText: /^Gentle$/ }).click(); }, target: '.drawer-foot >> text=Send now' },
  { id: 'bills', route: 'paperwork/expenses', target: '.bank-row:has-text("ENBRIDGE") >> text=Add expense' },
  { id: 'value', route: 'portfolio', target: '.bars-h.big li >> nth=0' },
  { id: 'taxes', route: 'taxes', target: 'text=Print for accountant' },
  { id: 'notice', route: 'rentals', open: async (pg) => { await lateOptions(pg); await pg.locator('.drawer .late-steps .btn.primary', { hasText: 'Prepare' }).first().click(); await pg.waitForSelector('.drawer .letter'); await pg.locator('.drawer .slide-confirm').scrollIntoViewIfNeeded(); }, target: '.drawer .slide-confirm' },
  { id: 'tenants', route: 'rent/property/p-maple/find', open: async (pg) => { await pg.locator('button', { hasText: /^Compare/ }).first().click(); await pg.waitForSelector('.drawer'); }, target: '.drawer table tr >> nth=0' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, timezoneId: 'America/Toronto', locale: 'en-CA' });
  // A fixed late-morning time today: a "Good morning" greeting and the same rent picture every run.
  const now = new Date(); now.setHours(10, 30, 0, 0);
  await ctx.clock.setFixedTime(now);
  const pg = await ctx.newPage();
  await pg.goto(BASE);
  await pg.locator('.lp-hero >> text=Try a demo first').click();
  await pg.locator('.tour-card >> text=Skip tour').click();
  const conv = await (await browser.newContext()).newPage();
  const hotspots = {};
  for (const s of SHOTS) {
    await pg.goto(`${BASE}#/${s.route}`);
    await pg.addStyleTag({ content: HIDE });
    await pg.evaluate(() => window.scrollTo(0, 0));
    await pg.waitForTimeout(500);
    if (s.open) await s.open(pg);
    await pg.waitForTimeout(500);
    const box = await pg.locator(s.target).first().boundingBox();
    if (!box || box.y < 0 || box.y + box.height > H || box.x < 0 || box.x + box.width > W) throw new Error(`${s.id}: marker target not on screen (${JSON.stringify(box)})`);
    const pc = (v, of) => +((v / of) * 100).toFixed(2);
    hotspots[s.id] = { x: pc(box.x, W), y: pc(box.y, H), w: pc(box.width, W), h: pc(box.height, H) };
    const png = await pg.screenshot({ type: 'png' });
    const webp = await conv.evaluate(async ({ src, w, q }) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = w; c.height = Math.round((img.height * w) / img.width);
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', q);
    }, { src: `data:image/png;base64,${png.toString('base64')}`, w: OUT_W, q: QUALITY });
    const file = path.join(OUT, `${s.id}.webp`);
    fs.writeFileSync(file, Buffer.from(webp.split(',')[1], 'base64'));
    const hs = hotspots[s.id];
    console.log(`${s.id.padEnd(9)} ${Math.round(fs.statSync(file).size / 1024)} KB  highlight at ${hs.x}%, ${hs.y}% (${hs.w}% x ${hs.h}%)`);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  }
  fs.writeFileSync(path.join(OUT, 'hotspots.json'), `${JSON.stringify(hotspots, null, 2)}\n`);
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
