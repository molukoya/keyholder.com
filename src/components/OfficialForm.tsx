import { useState } from 'react';
import type { Notice } from '../data/types';
import { useStore } from '../data/store';
import { serverMode } from '../data/api';
import { openOfficialPdf, pdfName } from '../data/officialForms';
import { Icon } from './Icon';

/** "Official form" on a served notice: the Landlord and Tenant Board's own PDF, exactly as it was filled in. */
export function OfficialPdfButton({ notice }: { notice: Notice }) {
  const { state, act } = useStore();
  const [busy, setBusy] = useState(false);
  if (!notice.official || !serverMode()) return null;
  const who = state.tenants.find((t) => t.id === notice.tenantId)?.names.join(' & ') ?? 'tenant';
  const open = async () => {
    setBusy(true);
    try { await openOfficialPdf(notice.formId, notice.official!.values, pdfName(notice, who)); }
    catch (e) { act.say((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <button className="btn small official-pdf" onClick={open} disabled={busy} aria-label={`${notice.kind} official form (PDF)`}>
      <Icon name="paper" size={14} />{busy ? 'Opening…' : 'Official form'}
    </button>
  );
}
