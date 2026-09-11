// Deterministic per-book "spine" styling — same book always looks the
// same, but different books get varied colors/heights/tilt so a shelf
// reads as an organic row of books rather than a uniform grid.
const SPINE_PALETTE = [
  '#7A2E2E', // burgundy
  '#2F4B38', // forest (moss-700)
  '#2C3E60', // navy
  '#8A5A20', // mustard/leather
  '#1F5C5C', // teal
  '#5B3A5B', // plum
  '#3A3A3A', // charcoal
  '#9C4A2C', // rust
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export interface SpineStyle {
  color: string;
  heightPx: number;
  widthPx: number;
  tiltDeg: number;
}

export function getSpineStyle(seed: string): SpineStyle {
  const hash = hashString(seed);
  return {
    color: SPINE_PALETTE[hash % SPINE_PALETTE.length]!,
    heightPx: 148 + (hash % 5) * 9, // 148-184px
    widthPx: 30 + ((hash >> 3) % 4) * 3, // 30-39px
    tiltDeg: ((hash >> 6) % 5) - 2, // -2..2deg
  };
}
