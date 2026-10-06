// Built-in stand-in pictures for the editor's preview (owner remark 76): the preview never shows
// the collection's real frames, so a new collection still looks like a page with content, and no
// guest's photo appears in the editor. Generated SVG scenes (no people, no faces, no network):
// a few calm compositions in muted tones, so the template's accent and background stay what the
// eye judges.

type Scene = 'hills' | 'sea' | 'lights' | 'still-life' | 'peaks' | 'table';

const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`;

function scene(kind: Scene, hue: number): string {
  const sky = hsl(hue, 30, 78);
  const mid = hsl((hue + 20) % 360, 24, 52);
  const deep = hsl((hue + 40) % 360, 22, 32);
  const light = hsl((hue + 10) % 360, 55, 90);
  switch (kind) {
    case 'hills':
      return `<rect width="120" height="120" fill="${sky}"/><circle cx="84" cy="34" r="12" fill="${light}"/><path d="M0 80 Q30 58 60 76 T120 70 V120 H0Z" fill="${mid}"/><path d="M0 98 Q40 80 80 96 T120 92 V120 H0Z" fill="${deep}"/>`;
    case 'sea':
      return `<rect width="120" height="120" fill="${sky}"/><rect y="66" width="120" height="54" fill="${mid}"/><circle cx="60" cy="66" r="16" fill="${light}"/><rect y="66" width="120" height="54" fill="${mid}" opacity="0.7"/><path d="M8 82 H52 M64 92 H112 M20 102 H70" stroke="${light}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`;
    case 'lights':
      return `<rect width="120" height="120" fill="${deep}"/><circle cx="28" cy="34" r="16" fill="${light}" opacity="0.5"/><circle cx="78" cy="28" r="10" fill="${light}" opacity="0.35"/><circle cx="96" cy="70" r="20" fill="${sky}" opacity="0.4"/><circle cx="40" cy="86" r="12" fill="${light}" opacity="0.3"/><circle cx="64" cy="58" r="7" fill="${light}" opacity="0.6"/>`;
    case 'still-life':
      return `<rect width="120" height="120" fill="${sky}"/><rect y="82" width="120" height="38" fill="${mid}"/><path d="M48 82 C40 70 42 54 52 46 V36 H66 V46 C76 54 78 70 70 82Z" fill="${deep}"/><circle cx="54" cy="26" r="9" fill="${light}"/><circle cx="68" cy="22" r="7" fill="${light}" opacity="0.8"/><circle cx="90" cy="76" r="7" fill="${light}"/>`;
    case 'peaks':
      return `<rect width="120" height="120" fill="${light}"/><path d="M0 96 L34 44 L52 70 L74 30 L120 96 V120 H0Z" fill="${mid}"/><path d="M74 30 L84 46 L78 44 L70 50 L64 44Z" fill="${light}"/><rect y="96" width="120" height="24" fill="${deep}"/>`;
    case 'table':
      return `<rect width="120" height="120" fill="${mid}"/><circle cx="40" cy="48" r="20" fill="${light}"/><circle cx="40" cy="48" r="12" fill="${sky}"/><circle cx="84" cy="78" r="16" fill="${light}"/><circle cx="84" cy="78" r="9" fill="${deep}" opacity="0.6"/><rect x="66" y="22" width="34" height="6" rx="3" fill="${light}" opacity="0.8"/><rect x="14" y="86" width="40" height="6" rx="3" fill="${deep}" opacity="0.5"/>`;
  }
}

const SCENES: readonly Scene[] = ['hills', 'table', 'sea', 'still-life', 'lights', 'peaks'];

/** The `n`-th stand-in picture (a data URL), varied in scene and tone. */
export function samplePhoto(n: number): string {
  const kind = SCENES[n % SCENES.length]!;
  const hue = (n * 67 + 18) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice">${scene(kind, hue)}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
