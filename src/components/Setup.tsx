import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../data/store';
import { keyholderScore } from '../lib/score';
import { Icon } from './Icon';
import { ScoreRing } from './levels';
import { ScoreList } from './Journey';

/** Setup progress: the % in a small ring by Help, with a red dot while steps are left. Tap for the list. */
export function SetupCircle() {
  const { state, today } = useStore();
  const { score, todo } = useMemo(() => keyholderScore(state, today), [state, today]);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [open]);
  const left = todo.length > 0 && score < 100;
  return (
    <>
      <button className="setup-circle" data-tour="score" onClick={() => setOpen(true)} aria-label={`Setup ${score}% done${left ? `, ${todo.length} steps left` : ''}`} title="Setup progress">
        <ScoreRing score={score} />{left && <i className="setup-dot" aria-hidden />}
      </button>
      {open && createPortal(
        <div className="acct-modal" role="dialog" aria-modal="true" aria-label="Setup progress">
          <div className="scrim" onClick={() => setOpen(false)} />
          <div className="acct-modal-card setup-card">
            <div className="acct-modal-head"><span>Setup progress</span><button className="btn ghost small" onClick={() => setOpen(false)} aria-label="Close setup progress"><Icon name="close" size={18} /></button></div>
            <ScoreList />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
