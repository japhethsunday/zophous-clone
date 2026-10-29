/* Shared inline icons for Suite-derived pages — same 24px,
   1.7 stroke style as the app shell. Exported so Assets and
   Director reuse one set instead of duplicating paths. */
import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  scissors: (<><circle cx="6" cy="6" r="2.6" /><circle cx="6" cy="18" r="2.6" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" /></>),
  film: (<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" /></>),
  sparkles: (<><path d="M10 3l1.8 4.7L16.5 9.5l-4.7 1.8L10 16l-1.8-4.7L3.5 9.5l4.7-1.8L10 3z" /><path d="M18 14l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" /></>),
  diamond: (<><path d="M12 3 3 12l9 9 9-9-9-9z" /></>),
  calendar: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></>),
  palette: (<><circle cx="12" cy="12" r="9" /><circle cx="9" cy="9.5" r="1.2" /><circle cx="14.5" cy="9" r="1.2" /><circle cx="15.5" cy="14" r="1.2" /></>),
  chart: (<><path d="M4 20V10M10 20V4M16 20v-8M21 20H3" /></>),
  mic: (<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>),
  type: (<><path d="M5 7V5h14v2M12 5v14M9 19h6" /></>),
  chat: (<><path d="M21 12a8 8 0 0 1-8 8H5l2-3a8 8 0 1 1 14-5z" /></>),
  megaphone: (<><path d="M3 11v3l4 1 9 4V6L7 10l-4 1z" /><path d="M19 9a3 3 0 0 1 0 6" /></>),
  arrow: (<><path d="M5 12h14M13 6l6 6-6 6" /></>),
  layers: (<><path d="m12 3 9 5-9 5-9-5 9-5z" /><path d="m3 13 9 5 9-5" /></>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>),
  play: (<><path d="M8 5.5v13l11-6.5-11-6.5z" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>),
  download: (<><path d="M12 4v11m0 0 4-4m-4 4-4-4M4 19h16" /></>),
  back: (<><path d="M19 12H5M11 6l-6 6 6 6" /></>),
};

export function SuiteIcon({ name, size = 17 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] ?? PATHS.sparkles}
    </svg>
  );
}
