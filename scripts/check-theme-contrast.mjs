import fs from 'node:fs';
import path from 'node:path';

const cssPath = path.resolve('src/app/globals.css');
const css = fs.readFileSync(cssPath, 'utf8');
const outputJson = process.argv.includes('--format=json');

const REQUIRED_RATIO = 4.5;
const THEME_SELECTORS = {
  light: ':root',
  dark: '.dark',
};

const PAIRS = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['primary-container-foreground', 'primary-container'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'muted'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['sidebar-foreground', 'sidebar-background'],
  ['sidebar-primary-foreground', 'sidebar-primary'],
  ['sidebar-accent-foreground', 'sidebar-accent'],
  ['color-on-warning', 'color-warning'],
  ['color-on-warning-container', 'color-warning-container'],
  ['color-on-success', 'color-success'],
  ['color-on-success-container', 'color-success-container'],
  ['color-on-error', 'color-error'],
  ['color-on-error-container', 'color-error-container'],
  ['color-on-info', 'color-info'],
  ['color-on-info-container', 'color-info-container'],
  ['color-on-secondary', 'color-secondary'],
  ['color-on-secondary-container', 'color-secondary-container'],
  ['color-on-primary', 'color-primary'],
  ['color-on-primary-container', 'color-primary-container'],
  ['color-on-surface', 'color-surface'],
  ['color-on-surface-variant', 'color-surface-variant'],
  ['color-on-trend-positive-container', 'color-trend-positive-container'],
  ['color-on-trend-negative-container', 'color-trend-negative-container'],
  ['color-on-trend-neutral-container', 'color-trend-neutral-container'],
];

function extractBlock(cssText, selector) {
  const start = cssText.indexOf(selector);
  if (start === -1) {
    throw new Error(`Missing selector block: ${selector}`);
  }
  const open = cssText.indexOf('{', start);
  if (open === -1) {
    throw new Error(`Missing opening brace for selector: ${selector}`);
  }
  let depth = 0;
  for (let i = open; i < cssText.length; i += 1) {
    const char = cssText[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return cssText.slice(open + 1, i);
      }
    }
  }
  throw new Error(`Unclosed selector block: ${selector}`);
}

function parseVariables(block) {
  const vars = new Map();
  const regex = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = regex.exec(block)) !== null) {
    vars.set(match[1], match[2].trim());
  }
  return vars;
}

function resolveToken(name, vars, stack = []) {
  if (!vars.has(name)) {
    throw new Error(`Missing token: --${name}`);
  }
  if (stack.includes(name)) {
    throw new Error(`Circular token reference: ${[...stack, name].join(' -> ')}`);
  }

  const raw = vars.get(name);
  const varRef = raw.match(/^var\(--([\w-]+)\)$/);
  if (varRef) {
    return resolveToken(varRef[1], vars, [...stack, name]);
  }
  if (raw.includes('var(')) {
    throw new Error(`Unsupported token expression for --${name}: ${raw}`);
  }
  return raw;
}

function parseHslTriplet(value) {
  const match = value.match(/^(-?\d*\.?\d+)\s+(-?\d*\.?\d+)%\s+(-?\d*\.?\d+)%$/);
  if (!match) {
    throw new Error(`Unsupported HSL triplet: ${value}`);
  }
  const [, h, s, l] = match;
  return {
    h: Number(h),
    s: Number(s) / 100,
    l: Number(l) / 100,
  };
}

function hslToRgb({ h, s, l }) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hue < 60) [r1, g1, b1] = [c, x, 0];
  else if (hue < 120) [r1, g1, b1] = [x, c, 0];
  else if (hue < 180) [r1, g1, b1] = [0, c, x];
  else if (hue < 240) [r1, g1, b1] = [0, x, c];
  else if (hue < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const to255 = (value) => Math.round((value + m) * 255);
  return { r: to255(r1), g: to255(g1), b: to255(b1) };
}

function toLinear(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb) {
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function formatRgb({ r, g, b }) {
  return `rgb(${r}, ${g}, ${b})`;
}

const reports = [];
const failures = [];

for (const [theme, selector] of Object.entries(THEME_SELECTORS)) {
  const vars = parseVariables(extractBlock(css, selector));
  for (const [fgToken, bgToken] of PAIRS) {
    try {
      const fgValue = resolveToken(fgToken, vars);
      const bgValue = resolveToken(bgToken, vars);
      const fgRgb = hslToRgb(parseHslTriplet(fgValue));
      const bgRgb = hslToRgb(parseHslTriplet(bgValue));
      const ratio = contrastRatio(fgRgb, bgRgb);
      const record = {
        theme,
        foregroundToken: fgToken,
        backgroundToken: bgToken,
        foregroundValue: fgValue,
        backgroundValue: bgValue,
        foregroundRgb: formatRgb(fgRgb),
        backgroundRgb: formatRgb(bgRgb),
        ratio: Number(ratio.toFixed(2)),
        threshold: REQUIRED_RATIO,
        ok: ratio >= REQUIRED_RATIO,
      };
      reports.push(record);
      if (!record.ok) {
        failures.push({
          ...record,
          reason: 'contrast-below-threshold',
        });
      }
    } catch (error) {
      const failure = {
        theme,
        foregroundToken: fgToken,
        backgroundToken: bgToken,
        threshold: REQUIRED_RATIO,
        ok: false,
        reason: error.message,
      };
      reports.push(failure);
      failures.push(failure);
    }
  }
}

if (outputJson) {
  console.log(JSON.stringify({ success: failures.length === 0, threshold: REQUIRED_RATIO, reports, failures }, null, 2));
} else {
  for (const report of reports) {
    if (report.ok) {
      console.log(`PASS [${report.theme}] ${report.foregroundToken} on ${report.backgroundToken}: ${report.ratio}:1 (${report.foregroundValue} -> ${report.foregroundRgb} on ${report.backgroundValue} -> ${report.backgroundRgb})`);
      continue;
    }
    if (report.reason === 'contrast-below-threshold') {
      console.log(`FAIL [${report.theme}] ${report.foregroundToken} on ${report.backgroundToken}: ${report.ratio}:1 < ${report.threshold}:1 (${report.foregroundValue} -> ${report.foregroundRgb} on ${report.backgroundValue} -> ${report.backgroundRgb})`);
      continue;
    }
    console.log(`FAIL [${report.theme}] ${report.foregroundToken} on ${report.backgroundToken}: ${report.reason}`);
  }
  console.log(`\nChecked ${reports.length} token pairs across ${Object.keys(THEME_SELECTORS).length} themes.`);
  if (failures.length) {
    console.log(`${failures.length} failure(s).`);
  } else {
    console.log('All token contrast checks passed.');
  }
}

if (failures.length) {
  process.exit(1);
}
