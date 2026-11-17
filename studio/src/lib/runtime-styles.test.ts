import { describe, expect, test } from 'bun:test';
import {
  artboardFrameStyle,
  artboardTransformStyle,
  layerIndentStyle,
  tokenSwatchStyle,
} from './runtime-styles';

describe('controlled runtime style inputs', () => {
  test('geometry exposes only numeric custom properties and leaves appearance to CSS', () => {
    expect(artboardFrameStyle(390, 1000, 0.5)).toEqual({
      '--ds-runtime-artboard-width': '390px',
      '--ds-runtime-artboard-height': '1000px',
      '--ds-runtime-artboard-scale': 0.5,
    });
    expect(artboardTransformStyle(768, 1)).toEqual({
      '--ds-runtime-artboard-width': '768px',
      '--ds-runtime-artboard-scale': 1,
    });
    expect(layerIndentStyle(2)).toEqual({ '--ds-runtime-layer-depth': 2 });
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => artboardFrameStyle(value, 1000, 1)).toThrow();
      expect(() => artboardTransformStyle(390, value)).toThrow();
      expect(() => layerIndentStyle(value)).toThrow();
    }
    expect(() => layerIndentStyle(1.5)).toThrow();
  });

  test('swatches are selected from registered presets, never arbitrary CSS', () => {
    expect(tokenSwatchStyle('violet')).toEqual({ '--ds-runtime-swatch-color': '#7655d9' });
    expect(() => tokenSwatchStyle('url(example.com)' as 'violet')).toThrow();
  });
});
