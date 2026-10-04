/** A stand-in photo for stories: an inline SVG landscape in one hue, so stories need no network. */
export function samplePhoto(hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30"><rect width="40" height="30" fill="hsl(${hue} 35% 62%)"/><circle cx="28" cy="10" r="5" fill="hsl(${hue} 50% 85%)"/><path d="M0 30 L14 14 L24 24 L30 18 L40 30Z" fill="hsl(${hue} 30% 38%)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
