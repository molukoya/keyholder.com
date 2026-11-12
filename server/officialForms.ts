import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFCheckBox, PDFDocument, PDFRadioGroup, PDFTextField, StandardFonts } from '@cantoo/pdf-lib';
import { OFFICIAL, type PdfValue } from '../src/lib/ltbForms';

// Ontario's official LTB forms, filled in. The PDFs in server/forms/ltb are Tribunals Ontario's own files
// (tribunalsontario.ca/ltb/forms), opened once with their public (empty) password so their fields can be filled:
// every page is identical to the published form (see server/forms/ltb/README.md). The forms allow filling in their
// fields, and that is all Keyholder does. Their XFA layer is dropped so every PDF reader shows the filled fields.

const DIRS = [
  resolve(process.cwd(), 'server/forms/ltb'),
  fileURLToPath(new URL('./forms/ltb', import.meta.url)),
  fileURLToPath(new URL('../server/forms/ltb', import.meta.url)),
];
const dir = () => DIRS.find((d) => existsSync(resolve(d, 'N4.pdf')));
const cache = new Map<string, Uint8Array>();

async function original(formId: string): Promise<Uint8Array> {
  const f = OFFICIAL[formId];
  if (!f) throw new OfficialFormError(`No official form for ${formId}.`);
  const hit = cache.get(f.file);
  if (hit) return hit;
  const d = dir();
  if (!d) throw new OfficialFormError('The official forms are missing on the server (server/forms/ltb).');
  const bytes = new Uint8Array(await readFile(resolve(d, f.file)));
  cache.set(f.file, bytes);
  return bytes;
}

export class OfficialFormError extends Error {}

/** The official form with these values in its fields. */
export async function fillOfficial(formId: string, values: Record<string, PdfValue>): Promise<Uint8Array> {
  const bytes = await original(formId);
  // The library notes each time that it drops the XFA layer; that is expected here.
  const warn = console.warn;
  console.warn = (...a: unknown[]) => { if (!String(a[0]).startsWith('Removing XFA')) warn(...a); };
  let doc: PDFDocument;
  try { doc = await PDFDocument.load(bytes); } finally { console.warn = warn; }
  const form = doc.getForm();
  const unknown: string[] = [];
  for (const [name, v] of Object.entries(values)) {
    const f = form.getFieldMaybe(name);
    if (!f) { unknown.push(name); continue; }
    if (f instanceof PDFTextField && typeof v === 'string') {
      const max = f.getMaxLength();
      const text = (max ? v.slice(0, max) : v).replace(/\r/g, '');
      f.setText(text);
      // A readable size: the forms' own setting makes multi-line boxes grow their text to fill the box.
      if (f.isMultiline()) f.setFontSize(10);
      else if (text.length > 40) f.setFontSize(9);
    } else if (f instanceof PDFCheckBox && v === true) f.check();
    else if (f instanceof PDFRadioGroup && typeof v === 'object') f.select(v.radio);
    else unknown.push(name);
  }
  if (unknown.length) throw new OfficialFormError(`These fields are not on ${OFFICIAL[formId].version}: ${unknown.slice(0, 5).join(', ')}`);
  form.updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
  return doc.save({ useObjectStreams: false });
}

/** "N4 - Nora Bell - 2026-11-12.pdf" (letters, numbers, spaces and dashes only). */
export const formFilename = (code: string, who: string, date: string) => `${code} - ${who} - ${date}`.replace(/[^\w .-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) + '.pdf';
