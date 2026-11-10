// Packs dist/ into one self-contained HTML file for previewing inside Claude (artifact).
// Usage: npm run build && node scripts/build-artifact.mjs <out.html>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist/keyholder-preview.html';
const html = readFileSync('dist/index.html', 'utf8');
const js = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/);
const css = html.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/);
if (!js || !css) throw new Error('Could not find built assets in dist/index.html');
// Photos and screenshots are separate files on the website; the single-file preview embeds them instead.
// The build refers to each by file name (new URL(`name.webp`, import.meta.url)), and a data: URL there
// resolves to itself, so swapping the name for the image's data: URL is enough.
const TYPES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif' };
const embed = (code) => readdirSync(join('dist', 'assets')).reduce((acc, f) => {
  const type = TYPES[f.split('.').pop().toLowerCase()];
  if (!type || !acc.includes(f)) return acc;
  const uri = `data:${type};base64,${readFileSync(join('dist', 'assets', f)).toString('base64')}`;
  return acc.split(`./assets/${f}`).join(uri).split(`assets/${f}`).join(uri).split(f).join(uri);
}, code);
const script = embed(readFileSync(join('dist', js[1]), 'utf8')).replace(/<\/script/gi, '<\\/script');
const style = embed(readFileSync(join('dist', css[1]), 'utf8')).replace(/<\/style/gi, '<\\/style');

const page = `<title>Keyholder</title>
<meta name="theme-color" content="#F6F7FB">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500&family=Hanken+Grotesk:wght@400;500;600;700&family=Raleway:wght@700;800&display=swap" rel="stylesheet">
<style>${style}</style>
<div id="root"></div>
<script>window.__KH_EMBED = true;</script>
<script type="module">${script}</script>
`;
writeFileSync(out, page);
console.log(`Wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
