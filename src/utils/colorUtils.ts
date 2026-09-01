export function generateInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3);
}

// WCAG relative luminance. The naive gamma-free average rates saturated mid blues
// as "light" and pairs them with black text, which is unreadable.
export function getContrastColor(hex: string): '#000000' | '#ffffff' {
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? '#000000' : '#ffffff';
}

function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return h * 360;
}

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// Returns a color whose hue is as far as possible from all existing colors.
export function generateDistinctColor(existingColors: string[]): string {
  const existingHues = existingColors
    .filter(c => /^#[0-9a-f]{6}$/i.test(c))
    .map(hexToHue);

  let bestHue = 0;
  let bestScore = -1;

  for (let i = 0; i < 36; i++) {
    const candidate = i * 10;
    const score = existingHues.length === 0
      ? 360
      : Math.min(...existingHues.map(h => hueDist(candidate, h)));
    if (score > bestScore) {
      bestScore = score;
      bestHue = candidate;
    }
  }

  return hslToHex(bestHue, 65, 48);
}
