import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { GLYPH_SCALE, GLYPH_SHADER, GLYPH_OPACITY } from '../src/lib/life/renderer.mjs';
import { backgroundSize, stampPointerRandom, STEP_INTERVAL_MS, POINTER_INTERVAL_MS, POINTER_DISTANCE_PX } from '../src/lib/life/background.mjs';
import { randomBrush, writeRandomBrush } from '../src/lib/life/gpu-life.mjs';

test('glyph fills its tight 9.9px pitch at 1.5x previous size without changing blur', () => {
  assert.equal(GLYPH_SCALE, 1);
  assert.equal(GLYPH_OPACITY, 0.28);
  assert.ok(GLYPH_SHADER.includes('(cell + vec2f(0.5) + (corner - vec2f(0.5)) * 1) / settings.grid'));
  const component = readFileSync(new URL('../src/components/LifeBackground.astro', import.meta.url), 'utf8');
  const blur = Number(component.match(/filter: blur\(([\d.]+)px\)/)[1]);
  assert.equal(blur, 0.05);
  const bounds = [0, 1].map(corner => 0.5 + (corner - 0.5) * GLYPH_SCALE);
  assert.deepEqual(bounds, [0, 1]);
  assert.equal((bounds[0] + bounds[1]) / 2, 0.5);
  for (const dpr of [1, 2, 5]) {
    const size = backgroundSize(2475, 2475, dpr);
    assert.equal(size.width, 250);
    assert.equal(size.height, 250);
    const pitch = 2475 / size.width;
    assert.equal(pitch, 9.9);
    assert.ok(Math.abs(pitch * GLYPH_SCALE - 6.6 * 1.5) < 1e-12);
    assert.equal(pitch * (1 - GLYPH_SCALE), 0);
  }
  for (const width of [320, 1440, 3520]) {
    const pitch = width / backgroundSize(width, 900).width;
    assert.ok(pitch <= 9.9 && pitch > 9.6);
  }
});

test('minification uses bounded prefiltered mip levels and tile-local sample centers', () => {
  const source = readFileSync(new URL('../src/lib/life/renderer.mjs', import.meta.url), 'utf8');
  assert.match(source, /mipLevelCount: 6/);
  assert.match(source, /mipLevel < 6/);
  assert.ok(GLYPH_SHADER.includes('textureSampleLevel(atlas, atlasSampler, uv, lod)'));
  assert.ok(GLYPH_SHADER.indexOf('dpdx(in.uv)') < GLYPH_SHADER.indexOf('if (in.live == 0u) { discard; }'));
  for (let level = 0; level < 6; level++) {
    const tile = 32 / 2 ** level;
    for (let glyph = 0; glyph < 15; glyph++) {
      for (const corner of [0, 1]) {
        const pixel = glyph * tile + 0.5 + corner * (tile - 1);
        assert.ok(pixel >= glyph * tile + 0.5);
        assert.ok(pixel <= (glyph + 1) * tile - 0.5);
      }
    }
  }
});

test('random brush has exactly 59 distinct cells and deterministic variation', () => {
  const a = randomBrush(13, 0.35, () => 0);
  assert.equal(a.filter(value => value === 15).length, 59);
  assert.ok(a.every(value => value === 0 || value === 15));
  assert.deepEqual(a, randomBrush(13, 0.35, () => 0));
  assert.notDeepEqual(a, randomBrush(13, 0.35, () => 0.99));
  for (const size of [0, 2, 33, NaN]) assert.throws(() => randomBrush(size), RangeError);
  for (const density of [-1, 2, NaN]) assert.throws(() => randomBrush(13, density), RangeError);
});

test('pointer passes center; row replacement clips edges and preserves outside footprint', () => {
  let center;
  stampPointerRandom({ stampRandom(x, y, options) { center = [x, y, options]; } }, 8, 6);
  assert.deepEqual(center, [8, 6, { size: 19 }]);
  for (const [x, y] of [[10, 10], [0, 0], [19, 19]]) {
    const cells = new Uint32Array(400).fill(7);
    let writes = 0;
    const write = (offset, row) => { writes++; cells.set(row, offset / 4); };
    writeRandomBrush(20, 20, x, y, write, { size: 19, rng: () => 0 });
    assert.ok(writes <= 19);
    for (let py = 0; py < 20; py++) for (let px = 0; px < 20; px++) {
      const inside = Math.abs(px - x) <= 9 && Math.abs(py - y) <= 9;
      assert.equal(cells[py * 20 + px] === 7, !inside);
    }
    if (x === 10) {
      assert.equal(cells.filter(value => value === 15).length, 126);
      writeRandomBrush(20, 20, x, y, write, { size: 19, rng: () => 0.99 });
      assert.equal(cells.filter(value => value === 15).length, 126);
    }
  }
});

test('8.75Hz cadence; initialization, idle and rebuild never create fresh cells', async () => {
  assert.equal(STEP_INTERVAL_MS, 200 / 1.75);
  assert.equal(1000 / STEP_INTERVAL_MS, 8.75);
  assert.equal(POINTER_INTERVAL_MS, 22.5);
  assert.equal(POINTER_DISTANCE_PX, 4.5);
  const source = readFileSync(new URL('../src/lib/life/background.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /seedAmbient|AMBIENT_INTERVAL|stampGlider|\.upload\(/);
  assert.equal((source.match(/\.stampRandom\(/g) ?? []).length, 1);
  const window = new EventTarget(), document = new EventTarget(), motion = new EventTarget();
  motion.matches = false; document.hidden = false; document.body = {};
  document.createElement = () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, getImageData: () => ({ data: [0, 0, 0, 255] }) }) });
  const device = new EventTarget();
  device.limits = { maxTextureDimension2D: 4096 }; device.lost = new Promise(() => {}); device.destroy = () => {};
  let nextFrame, timer, now = 0, renders = 0;
  const simulations = [];
  const context = {
    window, document, AbortController, matchMedia: () => motion,
    navigator: { gpu: { requestAdapter: async () => ({ requestDevice: async () => device }) } },
    innerWidth: 440, innerHeight: 440, devicePixelRatio: 1,
    getComputedStyle: () => ({ color: '#000' }), performance: { now: () => now },
    requestAnimationFrame: callback => { nextFrame = callback; return 1; }, cancelAnimationFrame: () => { nextFrame = undefined; },
    setTimeout: callback => { timer = callback; return 1; }, clearTimeout: () => { timer = undefined; },
    createLifeRenderer: async () => ({ render() { renders++; }, destroy() {} }),
    createLifeSimulation: async ({ width, height }) => {
      const simulation = { width, height, generation: 0, stamps: [], destroyed: false,
        stampRandom(x, y) { this.stamps.push([x, y]); }, step() { this.generation++; }, destroy() { this.destroyed = true; } };
      simulations.push(simulation); return simulation;
    },
  };
  runInNewContext(source.replace(/^import .*;\n/gm, '').replace(/export /g, '') + '\nthis.start = startLifeBackground;', context);
  const canvas = { dataset: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 440, height: 440 }) };
  const stop = context.start(canvas);
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const frameAt = time => { now = time; assert.ok(nextFrame); nextFrame(now); };
  const pointer = (pointerType, clientX, clientY) => {
    const event = new Event('pointermove'); Object.assign(event, { pointerType, clientX, clientY }); window.dispatchEvent(event);
  };
  await settle();
  assert.equal(canvas.dataset.status, 'running'); assert.ok(renders > 0);
  assert.deepEqual(simulations[0].stamps, []);
  frameAt(STEP_INTERVAL_MS - 0.001); assert.equal(simulations[0].generation, 0);
  frameAt(STEP_INTERVAL_MS); assert.equal(simulations[0].generation, 1);
  for (let i = 2; i <= 30; i++) frameAt(i * (STEP_INTERVAL_MS + 1));
  assert.deepEqual(simulations[0].stamps, []);
  pointer('touch', 220, 220); assert.deepEqual(simulations[0].stamps, []);
  now = 10000;
  pointer('mouse', 220, 220); assert.deepEqual(simulations[0].stamps, [[22, 22]]);
  now = 10022.499; pointer('mouse', 224.5, 220); assert.equal(simulations[0].stamps.length, 1);
  now = 10022.5; pointer('mouse', 224.5, 220); assert.deepEqual(simulations[0].stamps.at(-1), [22, 22]);
  assert.equal(simulations[0].stamps.length, 2, 'exact 22.5ms and 4.5px boundaries allow stamping');
  now = 10045; pointer('mouse', 228.999, 220); assert.equal(simulations[0].stamps.length, 2);
  now = 10045; pointer('mouse', 229, 220); assert.equal(simulations[0].stamps.length, 3, 'exact 4.5px distance allows stamping');
  assert.deepEqual(simulations[0].stamps.at(-1), [23, 22]);
  window.dispatchEvent(new Event('resize')); assert.ok(timer); timer(); await settle();
  assert.equal(simulations.length, 2); assert.equal(simulations[0].destroyed, true);
  assert.deepEqual(simulations[1].stamps, []);
  frameAt(now + STEP_INTERVAL_MS + 1); assert.deepEqual(simulations[1].stamps, []);
  now += 200; pointer('mouse', 300, 300); assert.deepEqual(simulations[1].stamps, [[30, 30]]);
  stop(); assert.equal(simulations[1].destroyed, true);
  now += 200; pointer('mouse', 100, 100); assert.equal(simulations[1].stamps.length, 1);
});
