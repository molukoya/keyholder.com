import { useState } from 'react';
import { Icon } from '../components/Icon';
import { useAnnouncements } from './store';

/** The message set on the support dashboard (Announcements), shown on the website or in the app. */
export function AnnouncementBar({ where }: { where: 'website' | 'app' }) {
  const list = useAnnouncements().filter((a) => a.active && (a.where === where || a.where === 'both'));
  const [hidden, setHidden] = useState<string[]>(() => { try { return JSON.parse(sessionStorage.getItem('kh-ann-hidden') || '[]'); } catch { return []; } });
  const a = list.find((x) => !hidden.includes(x.id));
  if (!a) return null;
  const hide = () => { const next = [...hidden, a.id]; setHidden(next); try { sessionStorage.setItem('kh-ann-hidden', JSON.stringify(next)); } catch { /* blocked */ } };
  return (
    <div className={`announce ${a.tone} ${where}`} role="status">
      <Icon name={a.tone === 'warning' ? 'alert' : 'info'} size={16} /><span>{a.text}</span>
      <button className="announce-x" onClick={hide} aria-label="Hide this message"><Icon name="close" size={14} /></button>
    </div>
  );
}
