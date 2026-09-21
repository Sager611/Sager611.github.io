import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundSize, startLifeBackground } from '../src/lib/life/background.mjs';

test('viewport resources stay bounded at high DPR and huge dimensions', () => {
  const size = backgroundSize(20000, 20000, 5);
  assert.equal(size.width, 356);
  assert.equal(size.height, 267);
  assert.equal(size.width * size.height, 95052);
  assert.equal(size.width * size.height * 4 * 2, 760416);
  assert.ok(size.width * size.height * 4 * 2 < 1000000);
  assert.ok(size.pixelsWidth <= 4096);
  assert.ok(size.pixelsHeight <= 4096);
});
test('tiny viewports retain a stampable grid', () => {
  const size = backgroundSize(1, 1, 1);
  assert.equal(size.width, 3);
  assert.equal(size.height, 3);
});
test('reduced motion skips GPU initialization entirely', () => {
  const original = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const canvas = { dataset: {} };
    const stop = startLifeBackground(canvas);
    assert.equal(canvas.dataset.status, 'reduced-motion');
    stop(); stop();
  } finally {
    if (original) globalThis.matchMedia = original;
    else delete globalThis.matchMedia;
  }
});
