import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSize, GLIDER, createLifeSimulation } from '../src/lib/life/gpu-life.mjs';

// Test-only oracle. Production never imports or runs a CPU simulation.
export function referenceStep(cells, width, height) {
  const next = new Uint32Array(cells.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const neighbors = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x + dx < 0 || y + dy < 0 || x + dx >= width || y + dy >= height) continue;
      const value = cells[(y + dy) * width + x + dx];
      if (value) neighbors.push(value);
    }
    const index = y * width + x;
    const eligible = neighbors.length === 3 || (cells[index] > 0 && neighbors.length === 2);
    if (eligible) next[index] = Math.max(cells[index], ...neighbors) - 1;
  }
  return next;
}

test('mixed-state blinker: births and survivors inherit local maximum minus one', () => {
  const input = Uint32Array.from([0,0,0, 4,15,8, 0,0,0]);
  const first = referenceStep(input, 3, 3);
  assert.deepEqual([...first], [0,14,0, 0,14,0, 0,14,0]);
  assert.deepEqual([...referenceStep(first, 3, 3)], [0,0,0, 13,13,13, 0,0,0]);
});
test('mixed block: a low survivor inherits a higher neighbor rather than retaining state', () => {
  const block = Uint32Array.from([1,2,0, 3,15,0, 0,0,0]);
  assert.deepEqual([...referenceStep(block, 3, 3)], [14,14,0, 14,14,0, 0,0,0]);
});
test('state-one eligible survivors and births both die', () => {
  assert.deepEqual(referenceStep(Uint32Array.from([0,0,0, 1,1,1, 0,0,0]), 3, 3), new Uint32Array(9));
  assert.deepEqual(referenceStep(new Uint32Array(4).fill(1), 2, 2), new Uint32Array(4));
});
test('self is included when its lifetime exceeds every neighboring lifetime', () => {
  const input = Uint32Array.from([0,1,0, 1,15,0, 0,0,0]);
  assert.deepEqual([...referenceStep(input, 3, 3)], [14,14,0, 14,14,0, 0,0,0]);
});
test('dead edges never wrap', () => {
  assert.deepEqual([...referenceStep(Uint32Array.from([15,0,15, 0,0,0, 15,0,0]), 3, 3)], [0,0,0,0,14,0,0,0,0]);
});
test('loneliness and overcrowding kill', () => {
  assert.equal(referenceStep(Uint32Array.of(15), 1, 1)[0], 0);
  assert.equal(referenceStep(new Uint32Array(9).fill(15), 3, 3)[4], 0);
});
// For ANY seed: each eligible result <= previous global max - 1; all other
// results are zero. Induction proves max(t) <= max(0, max(seed) - t).
function assertExtinction(seed, width, height) {
  let cells = seed;
  let maximum = Math.max(...cells);
  for (let tick = 1; tick <= 15; tick++) {
    cells = referenceStep(cells, width, height);
    const nextMaximum = Math.max(...cells);
    assert.ok(nextMaximum <= Math.max(0, maximum - 1), 'global maximum must drop, or remain zero');
    maximum = nextMaximum;
  }
  assert.equal(maximum, 0, 'every seed must be empty after at most 15 generations');
}

test('all 65,536 possible 2x2 seeds obey global-max decay and extinction', () => {
  for (let seed = 0; seed < 65536; seed++) {
    assertExtinction(Uint32Array.from([seed & 15, (seed >>> 4) & 15, (seed >>> 8) & 15, (seed >>> 12) & 15]), 2, 2);
  }
});
test('larger deterministic mixed seeds and every 3x3 occupancy obey extinction', () => {
  for (let mask = 0; mask < 512; mask++) {
    assertExtinction(Uint32Array.from({ length: 9 }, (_, i) => mask & (1 << i) ? 1 + ((mask + i * 7) % 15) : 0), 3, 3);
  }
  let random = 0x12345678;
  for (let sample = 0; sample < 128; sample++) {
    const width = 1 + sample % 17, height = 1 + sample % 11;
    const cells = Uint32Array.from({ length: width * height }, () => {
      random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
      return (random >>> 0) % 3 ? (random >>> 4) & 15 : 0;
    });
    assertExtinction(cells, width, height);
  }
});
test('lifetime-15 block reaches zero exactly on tick 15, then stays empty', () => {
  let block = new Uint32Array(4).fill(15);
  for (let tick = 1; tick <= 16; tick++) {
    block = referenceStep(block, 2, 2);
    assert.deepEqual(block, new Uint32Array(4).fill(Math.max(0, 15 - tick)));
  }
});
test('API validates sizes and glider remains top-left based', async () => {
  assert.throws(() => validateSize(0, 10), RangeError);
  assert.throws(() => validateSize(1.5, 10), RangeError);
  assert.deepEqual(GLIDER, [[1,0], [2,1], [0,2], [1,2], [2,2]]);
  assert.equal(new Set(GLIDER.map(String)).size, 5);
  await assert.rejects(createLifeSimulation({ width: -1, height: 10 }), RangeError);
});
