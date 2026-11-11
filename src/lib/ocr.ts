import { embedded } from '../components/ui';
import { readReceipt, type ReceiptGuess } from './receiptRead';

// Reads a receipt photo on the device (Tesseract, an open-source text reader compiled to WebAssembly).
// The photo is not sent anywhere to be read. Its files (about 9 MB) come from this website's own /ocr/
// folder (scripts/copy-ocr.mjs) and are fetched only the first time someone adds a photo; the browser
// keeps the language file for next time. Not available in the single-file Claude preview.

type Progress = (step: string, pct: number) => void;
type W = { recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };

export const canReadReceipts = () =>
  !embedded && typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof WebAssembly === 'object' && /^https?:$/.test(location.protocol);

// WebAssembly SIMD support (the faster engine), the same check wasm-feature-detect uses.
const SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
const hasSimd = () => { try { return WebAssembly.validate(SIMD); } catch { return false; } };

let worker: Promise<W> | null = null;
let listener: Progress = () => {};
const STEP: Record<string, string> = { 'loading tesseract core': 'Getting the reader ready', 'loading language traineddata': 'Getting the reader ready', 'initializing api': 'Getting the reader ready', 'recognizing text': 'Reading your receipt' };

function getWorker(): Promise<W> {
  worker ??= (async () => {
    const { createWorker, OEM } = await import('tesseract.js');
    const base = new URL('ocr/', document.baseURI).href;
    const w = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`,
      corePath: `${base}${hasSimd() ? 'tesseract-core-simd-lstm.js' : 'tesseract-core-lstm.js'}`,
      langPath: base.replace(/\/$/, ''),
      gzip: true,
      workerBlobURL: false,
      logger: (m: { status: string; progress: number }) => listener(STEP[m.status] ?? 'Getting the reader ready', Math.round((m.progress ?? 0) * 100)),
    });
    return w as unknown as W;
  })().catch((e) => { worker = null; throw e; });
  return worker;
}

/** A photo, straightened for reading: at most 2000 px on the long side, grey, with more contrast. */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const y = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
      const v = Math.max(0, Math.min(255, (y - 128) * 1.5 + 128));
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    }
    g.putImageData(d, 0, 0);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

/** Reads a receipt photo and returns what it found (or nothing). Gives up after `timeoutMs`. */
export async function readReceiptPhoto(file: Blob, today: string, onProgress: Progress = () => {}, timeoutMs = 60_000): Promise<ReceiptGuess & { text: string }> {
  listener = onProgress;
  const run = (async () => {
    const [canvas, w] = await Promise.all([prepare(file), getWorker()]);
    onProgress('Reading your receipt', 0);
    const { data } = await w.recognize(canvas);
    return { ...readReceipt(data.text, today), text: data.text };
  })();
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('The receipt took too long to read.')), timeoutMs));
  return Promise.race([run, timeout]);
}
