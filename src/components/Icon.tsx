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
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
};

export function Icon({ name, size = 20, title }: { name: keyof typeof P | string; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={P[name] ?? P.info} />
    </svg>
  );
}

export function KeyMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="4" fill="var(--pine)" />
      <circle cx="12" cy="16" r="6" fill="none" stroke="var(--brass)" strokeWidth="3" />
      <path d="M18 16h10M24 16v5M27 16v3" stroke="var(--brass)" strokeWidth="3" />
    </svg>
  );
}
