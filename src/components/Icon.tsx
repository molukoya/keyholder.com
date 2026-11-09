// Small line-icon set drawn for Keyholder (no icon library, no emoji).
const P: Record<string, string> = {
  today: 'M4 5h16M4 5v15h16V5M8 3v4M16 3v4M8 12h3v3H8z',
  rent: 'M4 20V9l8-5 8 5v11zM9 20v-6h6v6',
  money: 'M3 6h18v12H3zM3 10h18M7 15h3',
  paper: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  tray: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .2-1.3-1.5.3-2-3-1-1 1.8h-2L10 3.7l-3 1 .3 2L6 8.2 4 8 3 11l2 1-2 1 1 3 2-.2 1.3 1.5-.3 2 3 1 1-1.8h2l1 1.8 3-1-.3-2 1.3-1.5 2 .2 1-3z',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18',
  mail: 'M3 6h18v12H3zM3 6l9 7 9-7',
  key: 'M8 15a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 11h9M18 11v3M21 11v2',
  check: 'M5 12l5 5 9-10',
  edit: 'M4 20h4l11-11-4-4L4 16zM14 6l4 4',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 5l12 7-12 7z',
  sync: 'M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5',
  home: 'M3 11l9-7 9 7M5 9v11h14V9',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  info: 'M12 8v.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  alert: 'M12 4l9 16H3zM12 10v4M12 17v.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  // Friendly set for bills, events and quick actions
  flame: 'M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7.5z',
  drop: 'M12 3c3 4 6 7 6 10.5a6 6 0 0 1-12 0C6 10 9 7 12 3z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  wrench: 'M15 4a4 4 0 0 0-4 5l-7 7a2 2 0 0 0 3 3l7-7a4 4 0 0 0 5-4l-2 2-3-1-1-3z',
  receipt: 'M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21zM9 8h6M9 12h6M9 16h4',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  message: 'M4 5h16v11H8l-4 4z',
  phone: 'M7 3h10v18H7zM11 18h2',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  pin: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  cash: 'M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10v4M18 10v4',
  cheque: 'M3 7h18v10H3zM6 11h7M6 14h4M15 14h3',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  percent: 'M5 19 19 5M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a5.5 5.5 0 0 1 3.5 6',
  send: 'M4 12 20 4l-6 16-3-7z',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  door: 'M6 21V4h12v17M3 21h18M14 13v.01',
  leaf: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15zM5 19l8-8',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
};

export function Icon({ name, size = 20, title }: { name: keyof typeof P | string; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={P[name] ?? P.info} />
    </svg>
  );
}

export { KeyMark } from './Brand';
