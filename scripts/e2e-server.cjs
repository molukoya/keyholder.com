const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { rmSync } = require('node:fs');
// End-to-end test of the website + app + API together, as landlords and the support team use it.
// It starts the real server (npm run build first) with a fresh embedded database, drives Chromium at
// desktop and phone sizes, and stops the server at the end.
// Run: npm run build && node scripts/e2e-server.cjs        (ONLY=E2,E5 runs just those checks)

const PORT = Number(process.env.E2E_PORT || 8095);
const BASE = `http://localhost:${PORT}/`;
const DATA = `./.data/e2e-${Date.now()}`;
const ADMIN = { email: 'admin@keyholder.local', password: 'admin-password-123' };
const ONLY = (process.env.ONLY || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
const results = [];
const ok = (tag, name, pass, note = '') => { results.push({ tag, name, pass, note }); console.log(`· ${pass ? '✓' : '✗'} ${tag} ${name}${pass ? '' : ' — ' + note}`); };
const step = async (tag, name, fn) => {
  if (ONLY.length && !ONLY.includes(name.split(' ')[0])) return;
  try { const note = await fn(); ok(tag, name, true, note || ''); } catch (e) { ok(tag, name, false, String(e.message).split('\n')[0].slice(0, 200)); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const go = async (pg, r) => { await pg.goto(BASE + '#/' + r); await pg.waitForTimeout(300); };
const approve = async (pg) => { await pg.locator('.slide-confirm .knob').focus(); await pg.keyboard.press('Enter'); await pg.waitForTimeout(350); };
const api = async (pg, path) => pg.evaluate(async (p) => { const r = await fetch(p, { credentials: 'same-origin' }); return { status: r.status, body: await r.json().catch(() => null) }; }, path);
const outbox = async (to) => (await (await fetch(`${BASE}api/dev/outbox?to=${encodeURIComponent(to)}`)).json());
async function until(fn, ms = 6000, what = 'condition') { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch { /* retry */ } await wait(200); } throw new Error(`timed out waiting for ${what}`); }

async function answerQuestions(pg, first) {
  await pg.fill('#ob-first', first); await pg.fill('#ob-last', 'Morgan'); await pg.click('.q-foot >> text=Next');
  await pg.click('text=Ontario'); await pg.click('.q-foot >> text=Next');
  await pg.click('text=2 to 5 rental units'); await pg.click('.q-foot >> text=Next');
  await pg.click('text=Interac e-Transfer'); await pg.click('.q-foot >> text=Next');
  await pg.click('text=Knowing who has paid'); await pg.click('.q-foot >> text=Next');
  await pg.click("text=I don't know what costs I can claim"); await pg.click('.q-foot >> text=Next');
  await pg.click('text=Getting paid on time'); await pg.click('.q-foot >> text=See my plan');
  await pg.waitForSelector('text=Turn on your automation');
}
let receiptPath = null;
async function receiptImage(browser) {
  if (receiptPath) return receiptPath;
  const d = new Date(); d.setDate(d.getDate() - 2);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ctx = await browser.newContext({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 }); const r = await ctx.newPage();
  const sp = (n) => '&nbsp;'.repeat(n);
  await r.setContent(`<body style="margin:0;background:#e9e4da;display:grid;place-items:center;height:100vh"><div style="background:#fff;width:300px;padding:24px 20px;font:15px/1.5 'Courier New',monospace;color:#111;transform:rotate(-1.5deg)">
    <div style="text-align:center;font-weight:bold;font-size:20px">THE HOME DEPOT</div><div style="text-align:center">#7011 HAMILTON ON</div><br><div>${day} 14:32</div><br>
    <div>PAINT 1GAL${sp(8)}54.99</div><div>ROLLER KIT${sp(8)}21.51</div><br><div>SUBTOTAL${sp(10)}76.50</div><div>HST 13%${sp(11)}9.95</div><div style="font-weight:bold">TOTAL${sp(13)}86.45</div><div>VISA${sp(14)}86.45</div></div></body>`);
  receiptPath = require('node:path').join(require('node:os').tmpdir(), `kh-receipt-${Date.now()}.jpg`);
  await r.screenshot({ path: receiptPath, type: 'jpeg', quality: 85 }); await ctx.close();
  return receiptPath;
}
async function signIn(pg, email, password) {
  await go(pg, 'signin'); await pg.fill('#login-user', email); await pg.fill('#login-pass', password); await pg.click('.acct-login >> text=Sign in');
}
function watch(pg, errors, label) {
  pg.on('pageerror', (e) => errors.push(`${label} ${e.message}`));
  pg.on('console', (m) => { if (m.type() === 'error' && !/fonts|401|403|409|400|Failed to load resource/.test(m.text())) errors.push(`${label} console: ${m.text()}`); });
}

(async () => {
  rmSync(DATA, { recursive: true, force: true });
  const server = spawn(process.execPath, ['server-dist/index.mjs'], {
    env: { ...process.env, PORT: String(PORT), PGLITE_DIR: DATA, LOG_LEVEL: 'warn', ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, DEV_TOOLS: 'on', NODE_ENV: 'development', APP_URL: `http://localhost:${PORT}` },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  let b;
  try {
    await until(async () => (await fetch(`${BASE}api/health`)).ok, 20000, 'the server to start');
    b = await chromium.launch();
    for (const [vp, tag] of [[{ width: 1280, height: 900 }, 'desktop'], [{ width: 390, height: 844 }, 'phone']]) {
      const errors = [];
      const email = `alex.${tag}@landlord-e2e.ca`;
      let password = 'maple-street-48';
      const ctxA = await b.newContext({ viewport: vp, acceptDownloads: true });
      const pg = await ctxA.newPage(); watch(pg, errors, 'A');

      await step(tag, 'E1 The website runs with the server (accounts on the server)', async () => {
        await pg.goto(BASE); await pg.waitForSelector('.lp-hero-h');
        const s = await api(pg, '/api/session'); if (!s.body?.config) throw new Error('no session config'); return `version ${s.body.config.version}`;
      });
      await step(tag, 'E2 Signup: 6 questions, then name, email and password create a real account', async () => {
        await go(pg, 'start'); await answerQuestions(pg, 'Alex');
        if (await pg.locator('text=Open the link (preview)').count()) throw new Error('still the simulated link');
        await pg.fill('#ob-name', 'Alex Morgan'); await pg.fill('#ob-email', email); await pg.fill('#ob-pass', 'short');
        if (await pg.locator('.acct-email button.btn:not(.ghost)').isEnabled()) throw new Error('weak password accepted');
        await pg.fill('#ob-pass', password); await pg.click('text=Create my account');
        await pg.waitForSelector('text=Start here');
        const welcome = await until(async () => (await outbox(email)).find((m) => m.kind === 'welcome'), 4000, 'welcome email');
        return welcome.subject;
      });
      await step(tag, 'E3 The new account is saved on the server', async () => {
        const st = await until(async () => { const r = await api(pg, '/api/state'); return r.body?.revision >= 1 && r.body; }, 6000, 'first save');
        if (st.data.profile.name !== 'Alex Morgan') throw new Error('name on server: ' + st.data.profile.name); return `revision ${st.revision}`;
      });
      await step(tag, 'E4 Add a property, a unit and a tenant: all saved to the account', async () => {
        await go(pg, 'today'); await pg.locator('.start-steps a.btn:has-text("Add property")').click(); await pg.waitForSelector('h1:has-text("Rentals")');
        await pg.locator('text=Add your first property').click();
        await pg.fill('#pp-nick', 'Oak house'); await pg.fill('#pp-addr', '9 Oak St'); await pg.locator('.drawer-foot >> text=Save property').click(); await pg.waitForSelector('text=Oak house');
        await pg.locator('.prop-strip').first().click(); await pg.waitForTimeout(250);
        await pg.locator('text=Add a unit').first().click(); await pg.fill('#uf-l', 'Main'); await pg.fill('#uf-r', '2000'); await pg.locator('.drawer-foot >> text=Save unit').click(); await pg.waitForSelector('.unit-row:has-text("Main")');
        await pg.locator('text=Add tenant').first().click();
        await pg.fill('#tf-n0', 'Rita Gomez'); await pg.fill('#tf-e0', `rita.${tag}@tenant-e2e.ca`);
        const first = await pg.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; });
        await pg.fill('#tf-s', first); await pg.fill('#tf-r', '2000');
        await pg.locator('.drawer-foot >> text=Save tenant and lease').click(); await pg.waitForSelector('.unit-row:has-text("Rita Gomez")');
        const st = await until(async () => { const r = (await api(pg, '/api/state')).body; return r?.data?.tenants?.some((t) => t.names[0] === 'Rita Gomez') && r; }, 6000, 'tenant saved');
        return `${st.data.properties.length} property, ${st.data.tenants.length} tenant · revision ${st.revision}`;
      });
      await step(tag, 'E4b Expenses → photo of a receipt is read on the device (server security rules allow it) and saved to the account', async () => {
        const img = await receiptImage(b);
        await go(pg, 'expenses'); await pg.locator('.page-head >> text=Add an expense').click();
        await pg.locator('.capture-frame input[type=file]').setInputFiles(img);
        await pg.waitForSelector('#ex-amt', { timeout: 90000 });
        if ((await pg.inputValue('#ex-amt')) !== '86.45' || (await pg.inputValue('#ex-vendor')) !== 'Home Depot') throw new Error(`read: ${await pg.inputValue('#ex-amt')} ${await pg.inputValue('#ex-vendor')}`);
        await pg.locator('.drawer-foot >> text=Save').click();
        await until(async () => (await api(pg, '/api/state')).body?.data?.expenses?.some((e) => e.vendor === 'Home Depot' && e.amount === 8645 && e.receiptImage), 6000, 'expense saved with its photo');
      });
      await step(tag, 'E5 Mark rent paid and send the receipt: the tenant gets it by email', async () => {
        const st = (await api(pg, '/api/state')).body.data;
        const row = () => pg.locator('.rent-row', { hasText: 'Rita' });
        await go(pg, 'today'); await row().locator('text=Prepare lease').click(); await pg.waitForTimeout(200); await approve(pg);
        await row().locator('.row-act button.btn', { hasText: /^Inspection$/ }).click(); await pg.waitForTimeout(200); await approve(pg);
        await go(pg, 'rent/tenant/' + st.tenants[0].id); await pg.click('.page-head >> text=Confirm rent'); await pg.locator('.drawer-foot >> text=Mark paid').click(); await pg.waitForTimeout(300);
        await go(pg, 'today'); await pg.locator('.rent-row', { hasText: 'Rita' }).locator('text=Send receipt').click();
        const mail = await until(async () => (await outbox(`rita.${tag}@tenant-e2e.ca`)).find((m) => m.kind === 'receipt'), 8000, 'receipt email');
        if (!/Amount: \$2,000\.00/.test(mail.text_body)) throw new Error('receipt text: ' + mail.text_body.slice(0, 120));
        return mail.subject;
      });
      await step(tag, 'E6 Settings shows the account and that it is saved', async () => {
        await go(pg, 'settings'); await pg.waitForSelector(`text=${email}`); await pg.waitForSelector('.save-status');
        return (await pg.locator('.save-status').textContent()).trim();
      });
      await step(tag, 'E7 Sign out: back to the website, and the data leaves this browser', async () => {
        await go(pg, 'settings'); await pg.locator('#account >> text=Sign out').click(); await pg.waitForSelector('.lp-hero-h');
        const local = await until(async () => { const s = await pg.evaluate(() => JSON.parse(localStorage.getItem('keyholder:v1'))); return s && s.properties.length === 0 && s; }, 5000, 'local data cleared');
        if ((await api(pg, '/api/session')).body.user) throw new Error('still signed in on the server');
        return `local properties: ${local.properties.length}`;
      });
      const ctxB = await b.newContext({ viewport: vp, acceptDownloads: true });
      const pgB = await ctxB.newPage(); watch(pgB, errors, 'B');
      await step(tag, 'E8 Wrong password is refused with a clear message', async () => {
        await signIn(pgB, email, 'not-my-password'); await pgB.waitForSelector('.acct-error'); return (await pgB.locator('.acct-error').textContent()).trim();
      });
      await step(tag, 'E9 Sign in on another device: the same properties, tenants and receipts are there', async () => {
        await signIn(pgB, email, password); await pgB.waitForSelector('.rent-row:has-text("Rita")');
        await go(pgB, 'rentals'); await pgB.waitForSelector('text=Oak house');
      });
      await step(tag, 'E10 A change on one device shows on the other', async () => {
        await signIn(pg, email, password); await pg.waitForSelector('.rent-row:has-text("Rita")');
        await go(pgB, 'settings'); await pgB.locator('#profile > .sheet > label.check input').check();
        await until(async () => (await api(pgB, '/api/state')).body.data.profile.emailUpdates === true, 6000, 'saved on B');
        await pg.evaluate(() => window.dispatchEvent(new Event('focus')));
        await until(async () => (await pg.evaluate(() => JSON.parse(localStorage.getItem('keyholder:v1')))).profile.emailUpdates === true, 8000, 'device A updated');
      });
      await step(tag, 'E10b Signed out on the server mid-use: the change is kept and saved after signing in again', async () => {
        await go(pg, 'settings');
        await pg.evaluate(() => fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Keyholder': '1' } }));
        await pg.locator('#profile > .sheet > label.check input').uncheck();
        await pg.waitForSelector('text=You were signed out', { timeout: 8000 });
        await signIn(pg, email, password); await pg.waitForSelector('.rent-row:has-text("Rita")');
        await until(async () => (await api(pg, '/api/state')).body?.data?.profile?.emailUpdates === false, 8000, 'change saved after signing in');
      });
      await step(tag, 'E11 Help → Write to us reaches the support inbox', async () => {
        await go(pg, 'today'); await pg.locator(tag === 'phone' ? '.mobile-top .help-btn' : '.top-tools.desk .help-btn').click();
        await pg.locator('text=Write to us').click(); await pg.fill('#ct-subject', `Question from ${tag}`); await pg.fill('#ct-message', 'How do I add a second property?');
        await pg.locator('.contact-form >> text=Send').click(); await pg.waitForSelector('text=A person on our team will reply');
        await pg.keyboard.press('Escape');
        await until(async () => (await outbox(email)).find((m) => m.kind === 'ticket-ack'), 4000, 'acknowledgement email');
      });
      await step(tag, 'E12 Forgot password: the email link sets a new password and signs in', async () => {
        await pgB.locator('#account >> text=Sign out').click().catch(async () => { await go(pgB, 'settings'); await pgB.locator('#account >> text=Sign out').click(); });
        await pgB.waitForSelector('.lp-hero-h');
        await go(pgB, 'signin'); await pgB.locator('text=Forgot your password?').click(); await pgB.fill('#forgot-email', email); await pgB.click('text=Send the link');
        await pgB.waitForSelector('text=Check your email');
        const mail = await until(async () => (await outbox(email)).find((m) => m.kind === 'reset'), 4000, 'reset email');
        const link = mail.text_body.match(/https?:\/\/\S+/)[0];
        await pgB.goto(link); await pgB.fill('#new-pass', 'brand-new-password-1'); await pgB.click('text=Save and sign in');
        await pgB.waitForSelector('.rent-row:has-text("Rita")');
        password = 'brand-new-password-1';
      });
      await step(tag, 'E13 Download my data', async () => {
        await go(pgB, 'settings');
        const [dl] = await Promise.all([pgB.waitForEvent('download'), pgB.locator('text=Download my data').click()]);
        return dl.suggestedFilename();
      });
      await step(tag, 'E14 The demo (test / test) still opens the sample, and is never saved to the account', async () => {
        const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); watch(p, errors, 'demo');
        await signIn(p, 'test', 'test'); await p.waitForSelector('.rent-row'); await wait(1500);
        const s = await api(p, '/api/session'); if (s.body.user) throw new Error('demo created a session'); await ctx.close();
      });
      const ctxC = await b.newContext({ viewport: vp }); const ad = await ctxC.newPage(); watch(ad, errors, 'admin');
      await step(tag, 'E15 A real admin signs in to the live support dashboard', async () => {
        await signIn(ad, ADMIN.email, ADMIN.password); await ad.waitForSelector('.sp-page');
        if (tag === 'desktop') await ad.waitForSelector('.sp-sample.live');
        await go(ad, 'support/customers'); await ad.waitForSelector(`text=${email}`);
      });
      await step(tag, 'E16 The team replies to the request: the landlord gets the reply by email', async () => {
        await go(ad, 'support/inbox'); await ad.locator('.sp-tickets a', { hasText: `Question from ${tag}` }).click(); await ad.waitForSelector('.sp-thread');
        await ad.locator('.sp-reply textarea').fill('Open Rentals and tap Add property.'); await ad.locator('.sp-reply-foot .btn.primary').click();
        await ad.waitForSelector('.sp-head >> text=Waiting on them');
        await until(async () => (await outbox(email)).find((m) => m.kind === 'ticket-reply'), 5000, 'reply email');
        await go(ad, 'support/privacy'); await ad.waitForSelector('.ledger >> text=Reply sent');
      });
      await step(tag, 'E17 An announcement from the team shows on everyone\'s website', async () => {
        await go(ad, 'support/announcements'); await ad.fill('.sp-card textarea', `Welcome to the live Keyholder (${tag})`);
        await ad.locator('.seg[aria-label="Show on"] >> text=Both').click(); await ad.locator('.sp-card .btn.primary', { hasText: 'Post' }).click();
        await until(async () => (await (await fetch(`${BASE}api/announcements`)).json()).some((a) => a.text.includes(tag)), 5000, 'announcement saved');
        const ctx = await b.newContext({ viewport: vp }); const v = await ctx.newPage();
        await v.goto(BASE + '#/welcome'); await v.waitForSelector(`.announce.website >> text=Welcome to the live Keyholder (${tag})`); await ctx.close();
        await go(ad, 'support/announcements'); await ad.locator('.sp-rows li', { hasText: `(${tag})` }).locator('text=Hide').click();
        await until(async () => !(await (await fetch(`${BASE}api/announcements`)).json()).some((a) => a.text.includes(tag)), 5000, 'announcement hidden');
      });
      await step(tag, 'E18 The admin preview (admin / admin) still shows sample data only', async () => {
        const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
        await signIn(p, 'admin', 'admin'); await p.waitForSelector('.sp-page'); await p.waitForSelector('.sp-sample:not(.live)'); await ctx.close();
      });
      await step(tag, 'E19 Delete my account: password needed, then everything is gone', async () => {
        await go(pgB, 'settings'); await pgB.locator('text=Delete my account').first().click();
        await pgB.fill('#del-confirm', password); await pgB.locator('form.callout >> button.btn.danger').click();
        await pgB.waitForSelector('.lp-hero-h');
        const r = await fetch(`${BASE}api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Keyholder': '1' }, body: JSON.stringify({ email, password }) });
        if (r.status !== 401) throw new Error('can still sign in: ' + r.status);
      });
      await step(tag, 'E20 The other device notices it is signed out', async () => {
        await pg.reload(); await pg.waitForSelector('.lp-hero-h'); return 'back to the website';
      });
      ok(tag, 'E errors', errors.length === 0, errors.slice(0, 3).join(' | '));
      await ctxA.close(); await ctxB.close(); await ctxC.close();
    }
  } catch (e) {
    ok('setup', 'E0 could not run', false, e.message);
  } finally {
    if (b) await b.close();
    server.kill('SIGTERM');
    await wait(500);
    rmSync(DATA, { recursive: true, force: true });
  }
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.tag.padEnd(7)} ${r.name}${r.note ? ' — ' + r.note : ''}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed} of ${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
