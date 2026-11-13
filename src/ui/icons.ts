/** The small line icons used in the tab bar. */

const PATHS = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  cards: [
    'M7 7.5h11a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z',
    'M9 4h7',
    'M10 12h5',
    'M10 16h3',
  ],
  import: ['M12 3v12', 'm7.5 10.5 4.5 4.5 4.5-4.5', 'M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3'],
  backup: ['M3 5h18v5H3z', 'M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9', 'M10 14.5h4'],
  settings: ['M4 7h8', 'M16 7h4', 'M4 17h4', 'M12 17h8', 'M14 5v4', 'M10 15v4'],
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  for (const d of PATHS[name]) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
