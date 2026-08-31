import type { ReactNode, SVGProps } from 'react';

export type IconName = 'arrow-left' | 'arrow-right' | 'reload' | 'x' | 'plus' | 'search' | 'star' | 'menu' | 'folder' | 'trash' | 'edit' | 'external' | 'bookmark' | 'shield' | 'sliders' | 'check' | 'lock' | 'chevron-right' | 'more' | 'download' | 'history' | 'pin' | 'pin-off' | 'copy' | 'tabs' | 'split' | 'sparkle' | 'play' | 'puzzle' | 'block';

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    'arrow-left': <><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>,
    'arrow-right': <><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></>,
    reload: <><path d="M20 6v5h-5"/><path d="M18.5 8.5A7.5 7.5 0 1 0 19 15"/></>,
    x: <><path d="m7 7 10 10"/><path d="m17 7-10 10"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></>,
    star: <path d="m12 3 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 17.03l-5.5 2.89 1.05-6.12L3.1 9.47l6.15-.9L12 3Z"/>,
    menu: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
    more: <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></>,
    folder: <path d="M3.5 7.5v10A2.5 2.5 0 0 0 6 20h12a2.5 2.5 0 0 0 2.5-2.5v-8A2.5 2.5 0 0 0 18 7h-6l-2-2H6a2.5 2.5 0 0 0-2.5 2.5Z"/>,
    trash: <><path d="M4 7h16"/><path d="m9 7 .7-3h4.6l.7 3"/><path d="m6.5 7 .8 13h9.4l.8-13"/><path d="M10 11v5M14 11v5"/></>,
    edit: <><path d="M13.5 5.5 18.5 10.5"/><path d="m5 19 3.5-.8L19 7.7a1.4 1.4 0 0 0 0-2L17.8 4.5a1.4 1.4 0 0 0-2 0L5.8 15 5 19Z"/></>,
    external: <><path d="M14 4h6v6"/><path d="m20 4-9 9"/><path d="M19 14v5H5V5h5"/></>,
    bookmark: <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z"/>,
    shield: <><path d="M12 21s7-3.5 7-10V5l-7-2-7 2v6c0 6.5 7 10 7 10Z"/><path d="m9 12 2 2 4-4"/></>,
    sliders: <><path d="M4 6h5M15 6h5"/><circle cx="12" cy="6" r="3"/><path d="M4 18h5M15 18h5"/><circle cx="12" cy="18" r="3"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    'chevron-right': <path d="m9 5 7 7-7 7"/>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></>,
    pin: <><path d="M8.5 3h7"/><path d="M10 3v6l-3 4h10l-3-4V3"/><path d="M12 13v8"/></>,
    'pin-off': <><path d="M8.5 3h7"/><path d="M10 3v6l-3 4h10l-3-4V3"/><path d="M12 13v8"/><path d="m4 4 16 16"/></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
    tabs: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M13 5v14"/></>,
    split: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/><path d="m8 10-2 2 2 2M16 10l2 2-2 2"/></>,
    sparkle: <><path d="M12 3c.6 4.1 2.9 6.4 7 7-4.1.6-6.4 2.9-7 7-.6-4.1-2.9-6.4-7-7 4.1-.6 6.4-2.9 7-7Z"/><path d="M19 16c.2 1.7 1.2 2.7 3 3-1.8.3-2.8 1.3-3 3-.3-1.7-1.3-2.7-3-3 1.7-.3 2.7-1.3 3-3Z"/></>,
    play: <path d="m9 7 8 5-8 5V7Z"/>,
    puzzle: <path d="M19 13.5V19a2 2 0 0 1-2 2h-5.5a1 1 0 0 1-.9-1.43 2.6 2.6 0 1 0-4.7 0A1 1 0 0 1 5 21H3a2 2 0 0 1-2-2v-5.5a1 1 0 0 1 1.43-.9 2.6 2.6 0 1 0 0-4.7A1 1 0 0 1 1 7V5a2 2 0 0 1 2-2h5.5a1 1 0 0 1 .9 1.43 2.6 2.6 0 1 0 4.7 0A1 1 0 0 1 15 3h2a2 2 0 0 1 2 2v2.5a1 1 0 0 0 1.43.9 2.6 2.6 0 1 1 0 4.7 1 1 0 0 0-1.43.9Z"/>,
    block: <><circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/></>,
  };
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
