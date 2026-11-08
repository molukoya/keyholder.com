const { chromium } = require('playwright');
// End-to-end UX flow test: a new user from an empty start, the sample user through each tenant's journey,
// and every internal link on every page, at desktop and phone sizes.
// Run: npm run build && npx vite preview --port 4173 & node scripts/ux-flow-test.cjs
const out = process.argv[2] || '.';
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const results = [];
const ok = (tag, name, pass, note = '') => results.push({ tag, name, pass, note });

async function onboard(pg, sample) {
  await pg.goto(BASE);
  await pg.click('text=Ontario'); await pg.click('text=Continue');
  await pg.click('text=A few doors (2 to 5)'); await pg.click('text=Continue');
  await pg.click('text=Interac e-Transfer'); await pg.click('text=Continue');
  await pg.click('text=Wondering who has paid'); await pg.click('text=Continue');
  await pg.click('text=I never know what I can deduct'); await pg.click('text=Continue');
  await pg.click('text=Never chasing rent or paperwork again'); await pg.click('text=Continue');
  await pg.fill('#ob-name', 'Alex Morgan'); await pg.fill('#ob-email', 'alex@example.com');
  await pg.click(sample ? 'text=Explore with sample properties' : 'text=Start empty');
  await pg.waitForTimeout(300);
}
const state = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('keyholder:v1')));
const go = async (pg, r) => { await pg.goto(BASE + '#/' + r); await pg.waitForTimeout(250); };
const approve = async (pg) => { await pg.locator('.slide-confirm .knob').focus(); await pg.keyboard.press('Enter'); await pg.waitForTimeout(350); };
const step = async (tag, name, fn) => { try { const note = await fn(); ok(tag, name, true, note || ''); } catch (e) { ok(tag, name, false, String(e.message).split('\n')[0].slice(0, 160)); } };

(async () => {
  const b = await chromium.launch();
  for (const [vp, tag] of [[{ width: 1280, height: 900 }, 'desktop'], [{ width: 390, height: 844 }, 'phone']]) {
    const errors = [];
    // ---------------- A. New user, starting empty ----------------
    let pg = await (await b.newContext({ viewport: vp })).newPage();
    pg.on('pageerror', (e) => errors.push(`A ${e.message}`));
    pg.on('console', (m) => { if (m.type() === 'error' && !/fonts/.test(m.text())) errors.push(`A console: ${m.text()}`); });
    await step(tag, 'A1 Signup → empty Home shows 3 setup steps', async () => { await onboard(pg, false); await pg.waitForSelector('text=Add your property'); });
    await step(tag, 'A2 Home "Add" → Rentals → add a property', async () => {
      await pg.locator('.row a.btn:has-text("Add")').first().click(); await pg.waitForSelector('h1:has-text("Rentals")');
      await pg.locator('text=Add your first property').click();
      await pg.fill('#pp-nick', 'Oak house'); await pg.fill('#pp-addr', '9 Oak St'); await pg.locator('.drawer-foot >> text=Save property').click(); await pg.waitForTimeout(250);
      await pg.waitForSelector('text=Oak house');
    });
    await step(tag, 'A3 Open property → add a unit', async () => {
      await pg.locator('.prop-strip').first().click(); await pg.waitForTimeout(250);
      await pg.locator('text=Add a unit').first().click(); await pg.fill('#uf-l', 'Main'); await pg.fill('#uf-r', '2000'); await pg.locator('.drawer-foot >> text=Save unit').click(); await pg.waitForTimeout(250);
      await pg.waitForSelector('.unit-row:has-text("Main")');
    });
    await step(tag, 'A4 Add a tenant (lease from today)', async () => {
      await pg.locator('text=Add tenant').first().click();
      await pg.fill('#tf-n0', 'Rita Gomez'); await pg.fill('#tf-e', 'rita@example.com');
      const today = await pg.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; });
      await pg.fill('#tf-s', today); await pg.fill('#tf-r', '2000');
      await pg.locator('.drawer-foot >> text=Save tenant and lease').click(); await pg.waitForTimeout(300);
      await pg.waitForSelector('.unit-row:has-text("Rita Gomez")');
    });
    let row = (who) => pg.locator('.rent-row', { hasText: who });
    await step(tag, 'A5 Home row for the new tenant says "Prepare lease"', async () => {
      await go(pg, 'today'); const t = await row('Rita').locator('.row-act .btn').first().textContent(); if (t !== 'Prepare lease') throw new Error('button: ' + t); return t;
    });
    await step(tag, 'A6 Prepare lease → the same row now says "Inspection"', async () => {
      await row('Rita').locator('text=Prepare lease').click(); await pg.waitForTimeout(200); await approve(pg);
      const t = await row('Rita').locator('.row-act .btn').first().textContent(); if (t !== 'Inspection') throw new Error('button: ' + t); return t;
    });
    await step(tag, 'A7 Inspection → row moves on to rent', async () => {
      await row('Rita').locator('.row-act button.btn', { hasText: /^Inspection$/ }).click(); await pg.waitForTimeout(200); await approve(pg);
      const t = await row('Rita').locator('.row-act').textContent(); if (/Inspection/.test(t)) throw new Error('still inspection'); return 'now: ' + t.replace('⋯', '').trim();
    });
    await step(tag, 'A8 Rent paid → row says "Send receipt" → send → Paid', async () => {
      await go(pg, 'rent/tenant/' + (await state(pg)).tenants[0].id); await pg.click('.page-head >> text=Confirm rent'); await pg.locator('.drawer-foot >> text=Mark paid').click(); await pg.waitForTimeout(250);
      await go(pg, 'today'); const t = await row('Rita').locator('.row-act .btn').first().textContent(); if (t !== 'Send receipt') throw new Error('button: ' + t);
      await row('Rita').locator('text=Send receipt').click(); await pg.waitForTimeout(250);
      const st = await row('Rita').locator('.status').textContent(); if (!/Paid/.test(st)) throw new Error('status: ' + st); return st;
    });
    await step(tag, 'A9 Paperwork → Rental income shows the payment and receipt', async () => { await go(pg, 'paperwork/income'); await pg.waitForSelector('td:has-text("Rita Gomez")'); });
    await step(tag, 'A10 Add a receipt (expense) from the main button', async () => {
      await go(pg, 'today');
      if (tag === 'phone') await pg.locator('.bottombar .capture').click(); else await pg.locator('.rail >> text=Add a receipt').click();
      await pg.locator('text=No photo, just type it').click(); await pg.fill('#ex-amt', '120'); await pg.fill('#ex-vendor', 'Home Depot');
      await pg.locator('.drawer-foot >> text=Save').click(); await pg.waitForTimeout(250);
      await go(pg, 'paperwork/expenses'); await pg.waitForSelector('text=Home Depot');
    });
    await step(tag, 'A11 Score "Do it" opens the right form (what you paid → Silver)', async () => {
      await go(pg, 'today'); const next = await pg.locator('#score .row .title').first().textContent();
      await pg.locator('#score .row', { hasText: 'what you paid' }).locator('text=Do it').click(); await pg.waitForTimeout(250);
      if (await pg.locator('#sv-price').count()) { await pg.fill('#sv-price', '650000'); await pg.fill('#sv-date', '2020-05-01'); await pg.fill('#sv-owed', '400000'); await pg.locator('.drawer-foot >> text=Save').click(); await pg.waitForTimeout(300); return 'Silver form · ' + next.trim(); }
      return 'Opened: ' + (await pg.evaluate(() => location.hash)) + ' · ' + next.trim();
    });
    await step(tag, 'A12 Value tab shows Silver insights', async () => {
      const id = (await state(pg)).properties[0].id; await go(pg, `rent/property/${id}/value`); await pg.waitForSelector('text=Room to borrow'); await pg.waitForSelector('.gain-line');
    });
    await step(tag, 'A13 Mortgage tab → add mortgage (Gold) with an extra payment', async () => {
      const id = (await state(pg)).properties[0].id; await go(pg, `rent/property/${id}/mortgage`);
      await pg.locator('.invite >> button').click(); await pg.waitForTimeout(200);
      await pg.fill('#gd-cc', '3000'); await pg.fill('#gd-ltt', '8000'); await pg.fill('#mf-l', 'TD'); await pg.fill('#mf-p', '390000');
      await pg.locator('text=Add an extra payment').click();
      await pg.locator('.drawer-foot >> text=Save').click(); await pg.waitForTimeout(400);
      await pg.waitForSelector('text=Still owed'); const st = await state(pg); return `stage: ${st.properties[0].closingCosts !== undefined && st.mortgages.length ? 'Gold' : 'not gold'}`;
    });
    await step(tag, 'A14 Portfolio shows net worth and the property card', async () => { await go(pg, 'portfolio'); await pg.waitForSelector('text=Your net worth in property'); await pg.waitForSelector('.pcard:has-text("Oak house")'); });
    await step(tag, 'A15 Taxes shows the property', async () => { await go(pg, 'taxes'); await pg.waitForSelector('text=rental income · Oak house'); });
    await step(tag, 'A16 Settings → connect a bank → "Check now"', async () => {
      await go(pg, 'settings'); await pg.locator('text=Check my bank for me').click(); await pg.locator('.drawer .choice:has-text("TD")').click(); await pg.locator('text=Connect TD').click(); await pg.waitForTimeout(1400);
      await pg.locator('text=Check now').first().click(); await pg.waitForTimeout(300);
    });
    ok(tag, 'A errors', errors.length === 0, errors.slice(0, 3).join(' | '));

    // ---------------- B. Sample user: each tenant's journey ----------------
    const errsB = [];
    pg = await (await b.newContext({ viewport: vp })).newPage();
    pg.on('pageerror', (e) => errsB.push(`B ${e.message}`));
    pg.on('console', (m) => { if (m.type() === 'error' && !/fonts/.test(m.text())) errsB.push(`B console: ${m.text()}`); });
    await onboard(pg, true);
    const btn = async (who) => (await row(who).locator('.row-act .btn').first().textContent())?.trim();
    await step(tag, 'B1 Each row shows status + one button', async () => {
      const got = { Maya: await btn('Maya'), Jordan: await btn('Jordan'), 'Unit C': await btn('Unit C'), Sam: await btn('Sam') };
      const want = { Maya: 'Send receipt', Jordan: 'Send reminder', 'Unit C': 'Review', Sam: 'Confirm' };
      for (const k in want) if (got[k] !== want[k]) throw new Error(JSON.stringify(got));
      if (!(await pg.locator('.prop-line:has-text("mortgage renews")').count())) throw new Error('no mortgage line');
      if (await pg.locator('.journey-track, .jcard').count()) throw new Error('journey stages still shown');
      return JSON.stringify(got);
    });
    await step(tag, 'B2 Sam: Confirm → same row says "Send receipt" → send → Paid', async () => {
      await row('Sam').locator('text=Confirm').click(); await pg.waitForTimeout(250);
      if ((await btn('Sam')) !== 'Send receipt') throw new Error('button: ' + (await btn('Sam')));
      await row('Sam').locator('text=Send receipt').click(); await pg.waitForTimeout(250);
      return (await row('Sam').locator('.status').textContent()) + ' · ' + ((await row('Sam').locator('.row-act').textContent()) || '').replace('⋯', '').trim();
    });
    await step(tag, 'B3 Maya: Send receipt → row shows Paid with no to-do (raise rent is not a to-do)', async () => {
      await row('Maya').locator('text=Send receipt').click(); await pg.waitForTimeout(250);
      if (await row('Maya').locator('.row-act .btn').count()) throw new Error('button: ' + (await btn('Maya')));
      return (await row('Maya').locator('.status').textContent()).trim();
    });
    await step(tag, 'B3b Rentals: below-market suggestion → Raise rent → N1 prepared', async () => {
      await go(pg, 'rentals'); const sg = pg.locator('.unit-row', { hasText: 'Maya' }).locator('.suggest');
      const text = (await sg.textContent()).slice(0, 90); await sg.locator('text=Raise rent').click(); await pg.waitForTimeout(200);
      if (!(await pg.locator('.drawer h2:has-text("N1")').count())) throw new Error('N1 did not open'); await approve(pg);
      return text;
    });
    await step(tag, 'B3c Raise rent is always reachable: ⋯ on Rentals and the tenant page', async () => {
      await go(pg, 'rentals'); await pg.locator('.unit-row', { hasText: 'Jordan' }).locator('.dots').click(); await pg.locator('[role=menuitem]:has-text("Raise rent")').click(); await pg.waitForTimeout(200);
      if (!(await pg.locator('.drawer h2:has-text("N1")').count())) throw new Error('⋯ did not open N1'); await pg.keyboard.press('Escape');
      await go(pg, 'rent/tenant/t-sam'); await pg.locator('.page-head >> text=Raise rent').click(); await pg.waitForTimeout(200);
      if (!(await pg.locator('.drawer h2:has-text("N1")').count())) throw new Error('tenant page did not open N1'); await pg.keyboard.press('Escape');
      await go(pg, 'today');
    });
    await step(tag, 'B4 Jordan: Send reminder → row says "Prepare N4"', async () => {
      await row('Jordan').locator('text=Send reminder').click(); await pg.waitForTimeout(250); const t = await btn('Jordan'); if (t !== 'Prepare N4') throw new Error('button: ' + t); return t;
    });
    await step(tag, 'B5 Jordan: Prepare N4 → approve → recorded', async () => {
      await row('Jordan').locator('text=Prepare N4').click(); await pg.waitForTimeout(200); await approve(pg);
      const n = (await state(pg)).notices.find((x) => x.kind === 'N4'); if (!n) throw new Error('no N4'); return 'pay by ' + n.terminationDate + ' · row now: ' + (await btn('Jordan'));
    });
    await step(tag, 'B6 Unit C: Review → assess → accept', async () => {
      await row('Unit C').locator('button:has-text("Review")').click(); await pg.waitForSelector('text=3. Applications');
      await pg.locator('.unit-row >> text=Review').first().click(); await pg.locator('.assess-checks label').first().click();
      await pg.locator('.drawer-foot >> text=Accept').click(); await pg.locator('.drawer-foot >> text=Make them the tenant').click(); await pg.waitForTimeout(300);
    });
    await step(tag, 'B7 New tenant row on Home says "Prepare lease"', async () => {
      await go(pg, 'today'); const s2 = await state(pg); const l = s2.leases.find((x) => x.unitId === 'u-c'); const name = s2.tenants.find((t) => t.id === l.tenantId).names[0];
      const t = await btn(name); if (t !== 'Prepare lease') throw new Error(name + ': ' + t); return name + ': ' + t;
    });
    await step(tag, 'B8 Mortgage line → "See mortgage" opens the Mortgage tab', async () => {
      await pg.locator('.prop-line >> text=See mortgage').click(); await pg.waitForSelector('text=Still owed');
    });
    await step(tag, 'B9 ⋯ → Hide for a week, then bring it back', async () => {
      await go(pg, 'today'); const line = pg.locator('.prop-line:has-text("mortgage renews")');
      await line.locator('.dots').click(); await pg.locator('text=Hide for a week').click(); await pg.waitForTimeout(200);
      const hidden = !(await line.count()); await pg.locator('text=hidden or ignored').locator('button').click(); await pg.locator('text=Bring back').first().click(); await pg.waitForTimeout(200);
      const back = await pg.locator('.prop-line:has-text("mortgage renews")').count(); if (!hidden || !back) throw new Error(`hidden=${hidden} back=${back}`); return 'mortgage line hidden, then back';
    });
    await step(tag, 'B10 Score list: pick any item; ⋯ Ignore raises the score', async () => {
      const n = await pg.locator('#score .row').count(); await pg.locator('#score >> text=Show all').click(); const n2 = await pg.locator('#score .row').count();
      const before = Number((await pg.locator('#score .score-ring > span').textContent()).trim());
      await pg.locator('#score .row').nth(1).locator('.dots').click(); await pg.locator('#score [role=menuitem]', { hasText: /^Ignore$/ }).click(); await pg.waitForTimeout(250);
      const after = Number((await pg.locator('#score .score-ring > span').textContent()).trim()); if (!(after > before)) throw new Error(before + ' → ' + after);
      return n + ' shown, ' + n2 + ' after Show all · score ' + before + ' → ' + after;
    });
    await step(tag, 'B11 Score chip scrolls to the score', async () => { await pg.locator('.score-chip').click(); await pg.waitForTimeout(500); if (!(await pg.locator('#score').isVisible())) throw new Error('not visible'); });
    await step(tag, 'B12 Forms library: prepare N1 for Maya', async () => {
      await go(pg, 'paperwork/forms'); await pg.locator('.form-row', { has: pg.locator('.form-code', { hasText: /^N1$/ }) }).locator('button:has-text("Prepare")').click(); await pg.waitForTimeout(200);
      if (await pg.locator('.drawer .choice').count()) await pg.locator('.drawer .choice:has-text("Maya")').click();
      await pg.waitForTimeout(200); if (!(await pg.locator('.slide-confirm').count())) throw new Error('checks failed'); await approve(pg);
    });
    await step(tag, 'B13 Late rent options from Rentals (Sam paid; none for Jordan after N4)', async () => {
      await go(pg, 'rentals'); const n = await pg.locator('text=Late rent options').count(); return `${n} "Late rent options" buttons`;
    });

    // ---------------- C. Every link on every page ----------------
    const pages = ['today', 'rentals', 'rent/property/p-maple', 'rent/property/p-maple/find', 'rent/property/p-maple/notices', 'rent/property/p-maple/value', 'rent/property/p-maple/mortgage', 'rent/property/p-birch/value', 'rent/tenant/t-maya', 'portfolio', 'portfolio/cash-flow', 'taxes', 'paperwork/expenses', 'paperwork/income', 'paperwork/leases', 'paperwork/notices', 'paperwork/forms', 'settings', 'more'];
    const bad = [];
    for (const p of pages) {
      await go(pg, p);
      if (await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) bad.push(`${p}: sideways scroll`);
      const hrefs = await pg.$$eval('a[href^="#/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
      for (const h of hrefs) {
        await pg.goto(BASE + h); await pg.waitForTimeout(120);
        const landed = await pg.evaluate(() => location.hash);
        const hasH1 = await pg.locator('h1').count();
        const target = h.replace(/#.*$/, '') === '#/today';
        if (!hasH1 || (landed.startsWith('#/today') && !h.startsWith('#/today') && !h.startsWith('#/todo') && !h.startsWith('#/tray'))) bad.push(`${p} → ${h} landed on ${landed}${hasH1 ? '' : ' (no heading)'}`);
        void target;
      }
    }
    ok(tag, 'C Every internal link lands on a real page', bad.length === 0, bad.slice(0, 6).join(' | ') || `${pages.length} pages swept`);
    // Navigation bars
    await step(tag, 'C2 Main navigation reaches every tab', async () => {
      const labels = tag === 'phone' ? ['Home', 'Portfolio', 'Rentals', 'More'] : ['Home', 'Portfolio', 'Rentals', 'Taxes', 'Paperwork', 'Settings'];
      const order = await pg.locator(tag === 'phone' ? '.bottombar a' : '.rail .nav-link').allTextContents(); if (!/Home.*Portfolio.*Rentals/.test(order.join(' '))) throw new Error('order: ' + order.join(', '));
      for (const l of labels) { await pg.locator(tag === 'phone' ? `.bottombar >> text=${l}` : `.rail >> text=${l}`).first().click(); await pg.waitForTimeout(150); }
      if (tag === 'phone') for (const l of ['Taxes', 'Paperwork', 'Settings']) { await go(pg, 'more'); await pg.locator(`.more-item:has-text("${l}")`).click(); await pg.waitForSelector(`h1:has-text("${l === 'Settings' ? 'Your Keyholder' : l}")`); }
    });
    ok(tag, 'B/C errors', errsB.length === 0, errsB.slice(0, 3).join(' | '));
  }
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.tag.padEnd(7)} ${r.name}${r.note ? ' — ' + r.note : ''}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed} of ${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
  await b.close();
})();
