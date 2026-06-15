// Utility to deterministically assign a card color index and variant based on a seed (id/title)
// Uses a simple hash and palette cycling for overflow

const PALETTE_SIZE = 16;

function hashString(str: string | undefined | null): number {
  // FNV-1a hash (fast, deterministic)
  if (!str) str = "";
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

export function getCardColorVars(seed: string, theme: 'light' | 'dark' = 'light') {
  const hash = hashString(seed);
  const baseIdx = (hash % PALETTE_SIZE) + 1; // 1-based for CSS vars
  // For overflow, adjust lightness/chroma by a small amount
  const overflow = Math.floor(hash / PALETTE_SIZE);
  const lightnessShift = overflow % 3; // 0,1,2
  // Compose CSS variable names
  const prefix = `--card-color-${baseIdx}`;
  const bg = `hsl(var(${prefix}-bg) / 1)`;
  const border = `hsl(var(${prefix}-border) / 1)`;
  const accent = `hsl(var(${prefix}-accent) / 1)`;
  const text = `hsl(var(${prefix}-text) / 1)`;
  // For overflow, add inline style for lightness shift
  let bgStyle = bg;
  let borderStyle = border;
  if (lightnessShift && theme === 'light') {
    bgStyle = `color-mix(in srgb, ${bg} ${(90 + 2*lightnessShift)}%, white)`;
    borderStyle = `color-mix(in srgb, ${border} ${(80 + 2*lightnessShift)}%, white)`;
  } else if (lightnessShift && theme === 'dark') {
    bgStyle = `color-mix(in srgb, ${bg} ${(90 + 2*lightnessShift)}%, black)`;
    borderStyle = `color-mix(in srgb, ${border} ${(80 + 2*lightnessShift)}%, black)`;
  }
  return {
    bg: bgStyle,
    border: borderStyle,
    accent,
    text,
    idx: baseIdx,
  };
}
