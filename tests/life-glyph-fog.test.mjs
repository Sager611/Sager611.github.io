import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { GLYPH_OPACITY, GLYPH_SHADER } from '../src/lib/life/renderer.mjs';

function blendPremultiplied(src, bg) {
  const sa = src[3];
  return [
    src[0] + bg[0] * (1 - sa),
    src[1] + bg[1] * (1 - sa),
    src[2] + bg[2] * (1 - sa),
    sa + bg[3] * (1 - sa),
  ];
}

function glyphComposite(inkRgb, bgRgba, opacity) {
  const alpha = opacity;
  return blendPremultiplied([
    inkRgb[0] * alpha,
    inkRgb[1] * alpha,
    inkRgb[2] * alpha,
    alpha,
  ], bgRgba);
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test('glyph fog opacity drives the shader uniform at 0.28', () => {
  assert.equal(GLYPH_OPACITY, 0.28);
  const source = readFileSync(new URL('../src/lib/life/renderer.mjs', import.meta.url), 'utf8');
  assert.match(source, /new Float32Array\(\[simulation\.width, simulation\.height, 0, 0, \.{3}ink, GLYPH_OPACITY\]\)/);
  assert.match(GLYPH_SHADER, /return vec4f\(settings\.ink\.rgb \* alpha, alpha\);/);
});

test('premultiplied glyph blending stays correct at fog opacity', () => {
  const bg = [0.97, 0.95, 0.92, 1];
  const ink = [0.76, 0.17, 0.12];
  const glyph = glyphComposite(ink, bg, 0.28);
  const full = glyphComposite(ink, bg, 1);
  const manual = blendPremultiplied([ink[0] * 0.28, ink[1] * 0.28, ink[2] * 0.28, 0.28], bg);
  assert.deepEqual(glyph, manual);
  assert.deepEqual(blendPremultiplied([0, 0, 0, 0], bg), bg);
  assert.ok(glyph[3] <= 1);
  assert.ok(distance(glyph, bg) < distance(full, bg));
  assert.ok(distance(glyph, bg) < distance(full, bg) * 0.3);
});

test('fogged glyphs composite much nearer the background than full text ink', () => {
  const lightBg = [0.972, 0.958, 0.936, 1];
  const darkBg = [0.085, 0.082, 0.095, 1];
  const lightInk = [0.22, 0.20, 0.19];
  const darkInk = [0.93, 0.92, 0.90];
  const lightFog = glyphComposite(lightInk, lightBg, 0.28);
  const lightFull = glyphComposite(lightInk, lightBg, 1);
  const darkFog = glyphComposite(darkInk, darkBg, 0.28);
  const darkFull = glyphComposite(darkInk, darkBg, 1);
  assert.ok(distance(lightFog, lightBg) < distance(lightFull, lightBg) * 0.4);
  assert.ok(distance(darkFog, darkBg) < distance(darkFull, darkBg) * 0.4);
  const report = {
    opacity: GLYPH_OPACITY,
    light: { bg: lightBg, fog: lightFog, full: lightFull },
    dark: { bg: darkBg, fog: darkFog, full: darkFull },
  };
  writeFileSync('/tmp/website-life-fog-result.json', JSON.stringify(report, null, 2));
  assert.ok(readFileSync('/tmp/website-life-fog-result.json', 'utf8').includes('"opacity": 0.28'));
});
