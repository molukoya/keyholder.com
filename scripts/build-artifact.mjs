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
<meta name="theme-color" content="#F4EFE6">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Archivo+Black&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Gloock&display=swap" rel="stylesheet">
<style>${style}</style>
<div id="root"></div>
<script>window.__KH_EMBED = true;</script>
<script type="module">${script}</script>
`;
writeFileSync(out, page);
console.log(`Wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
