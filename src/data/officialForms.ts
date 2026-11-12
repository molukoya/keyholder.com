import { api, ApiError } from './api';
import type { Notice } from './types';
import type { PdfValue } from '../lib/ltbForms';

// Ontario's official LTB forms, filled in by the server (src/lib/ltbForms.ts says what goes in each field).

/** The filled official form as a PDF. */
export async function officialPdf(formId: string, values: Record<string, PdfValue>, filename: string): Promise<Blob> {
  const r = await fetch(`/api/forms/${encodeURIComponent(formId)}/pdf`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Keyholder': '1' },
    body: JSON.stringify({ values, filename }),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(r.status, b.error ?? 'The form could not be made right now. Try again in a moment.');
  }
  return r.blob();
}

/**
 * Opens the filled form in a new tab (a tab opened right away on the click, so browsers allow it), or downloads it
 * if the browser blocks new tabs.
 */
export async function openOfficialPdf(formId: string, values: Record<string, PdfValue>, filename: string) {
  const tab = window.open('', '_blank');
  try {
    const blob = await officialPdf(formId, values, filename);
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) { tab?.close(); throw e; }
}

/** Emails a served notice to everyone on the lease (who agreed to notices by email), with the official form attached. */
export const emailNotice = (id: string) => api<{ queued: number; to: string[] }>('POST', `/api/notices/${encodeURIComponent(id)}/email`);

/** "N4 - Nora Bell - 2026-11-12.pdf" */
export const pdfName = (n: Pick<Notice, 'kind' | 'servedOn' | 'createdAt'>, who: string) =>
  `${n.kind} - ${who} - ${n.servedOn ?? n.createdAt.slice(0, 10)}`.replace(/[^\w .-]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
