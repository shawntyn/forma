import type { CSSProperties } from 'react';
import { THEME_PRESETS, themeSchema, themeToStyle, type PresetName, type Theme } from './tokens';

// These values describe runtime geometry or token previews, never saved page
// appearance. CSS recipes own their visual constants and consume only these keys.
type RuntimeStyle = CSSProperties & Record<`--ds-runtime-${string}`, string | number>;

function nonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid runtime geometry');
  return value;
}

export function layerIndentStyle(depth: number): RuntimeStyle {
  if (!Number.isInteger(depth)) throw new Error('Invalid layer depth');
  return { '--ds-runtime-layer-depth': nonNegative(depth) };
}

export function artboardFrameStyle(width: number, height: number, scale: number): RuntimeStyle {
  return {
    '--ds-runtime-artboard-width': `${nonNegative(width)}px`,
    '--ds-runtime-artboard-height': `${nonNegative(height)}px`,
    '--ds-runtime-artboard-scale': nonNegative(scale),
  };
}

export function artboardTransformStyle(width: number, scale: number): RuntimeStyle {
  return {
    '--ds-runtime-artboard-width': `${nonNegative(width)}px`,
    '--ds-runtime-artboard-scale': nonNegative(scale),
  };
}

export function tokenSwatchStyle(preset: PresetName): RuntimeStyle {
  const entry = THEME_PRESETS.find((item) => item.id === preset);
  if (!entry) throw new Error('Unknown theme preset');
  return { '--ds-runtime-swatch-color': entry.color };
}

export function applyRootTheme(theme: Theme): void {
  for (const [name, value] of Object.entries(themeToStyle(themeSchema.parse(theme)))) {
    document.documentElement.style.setProperty(name, value);
  }
}
