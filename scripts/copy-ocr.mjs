// Copies the receipt reader's files (Tesseract worker, engine, English language data) into public/ocr/,
// so the website serves them itself (no outside servers). Runs before `npm run dev` and `npm run build`.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = 'public/ocr';
mkdirSync(out, { recursive: true });
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.js', 'tesseract-core-simd-lstm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm', 'tesseract-core-simd-lstm.wasm'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.js', 'tesseract-core-lstm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm', 'tesseract-core-lstm.wasm'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
];
for (const [from, to] of files) {
  if (!existsSync(from)) throw new Error(`Missing ${from}: run npm install`);
  copyFileSync(from, join(out, to));
}
console.log(`receipt reader: ${files.length} files in ${out}`);
