import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function fixture(reduced = false) {
  const source = readFileSync(new URL('../src/components/LifeBackground.astro', import.meta.url), 'utf8');
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/import .*?;\s*/, '');
  const javascript = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const window = new EventTarget();
  const document = new EventTarget();
  const motion = new EventTarget();
  motion.matches = reduced;
  let present = true, starts = 0, stops = 0, active = 0;
  const canvas = { remove() { present = false; }, dataset: {} };
  document.querySelector = () => present ? canvas : null;
  document.body = { prepend() {} };
  runInNewContext(javascript, {
    window, document, matchMedia: () => motion,
    startLifeBackground() {
      const running = !motion.matches;
      if (running) { starts++; active++; }
      let stopped = false;
      return () => { if (!stopped && running) { stops++; active--; } stopped = true; };
    },
  });
  return { window, document, motion, stats: () => ({ present, starts, stops, active }), restoreCanvas: () => { present = true; } };
}

test('pagehide preserves canvas and pageshow restores a single running enhancement', () => {
  const f = fixture();
  f.window.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(f.stats(), { present: true, starts: 1, stops: 1, active: 0 });
  const restored = new Event('pageshow');
  Object.defineProperty(restored, 'persisted', { value: true });
  f.window.dispatchEvent(restored);
  assert.deepEqual(f.stats(), { present: true, starts: 2, stops: 1, active: 1 });
  f.window.dispatchEvent(new Event('pageshow'));
  assert.equal(f.stats().active, 1);
});

test('motion changes stop and restart, including initially reduced motion', () => {
  const f = fixture(true);
  assert.equal(f.stats().active, 0);
  f.motion.matches = false; f.motion.dispatchEvent(new Event('change'));
  assert.equal(f.stats().active, 1);
  f.motion.matches = true; f.motion.dispatchEvent(new Event('change'));
  assert.equal(f.stats().active, 0);
  f.window.dispatchEvent(new Event('pagehide'));
  f.motion.matches = false; f.motion.dispatchEvent(new Event('change'));
  assert.equal(f.stats().active, 0);
  f.window.dispatchEvent(new Event('pageshow'));
  assert.equal(f.stats().active, 1);
});

test('Astro swap removes stale canvas and page-load mounts the new one', () => {
  const f = fixture();
  f.document.dispatchEvent(new Event('astro:before-swap'));
  assert.equal(f.stats().present, false);
  assert.equal(f.stats().active, 0);
  f.document.dispatchEvent(new Event('astro:page-load'));
  assert.equal(f.stats().active, 0);
  f.restoreCanvas();
  f.document.dispatchEvent(new Event('astro:page-load'));
  assert.equal(f.stats().active, 1);
});
