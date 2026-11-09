// Packs dist/ into one self-contained HTML file for previewing inside Claude (artifact).
// Usage: npm run build && node scripts/build-artifact.mjs <out.html>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist/keyholder-preview.html';
const html = readFileSync('dist/index.html', 'utf8');
const js = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/);
const css = html.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/);
if (!js || !css) throw new Error('Could not find built assets in dist/index.html');
const script = readFileSync(join('dist', js[1]), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = readFileSync(join('dist', css[1]), 'utf8').replace(/<\/style/gi, '<\\/style');

const page = `<title>Keyholder</title>
<meta name="theme-color" content="#F6F7FB">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${style}</style>
<div id="root"></div>
<script>window.__KH_EMBED = true;</script>
<script type="module">${script}</script>
`;
writeFileSync(out, page);
console.log(`Wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
