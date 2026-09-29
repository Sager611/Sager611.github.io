import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSize, GLIDER, UP_RIGHT_GLIDER, isCell, createLifeSimulation, LIFE_SHADER, OLDEST, ZERO, ONE, AGE_SHIFT, MAX_BINARY_AGE } from '../src/lib/life/gpu-life.mjs';
import { referenceStep, state } from './life-reference.mjs';
import { GLIDER_BITS } from '../src/lib/life/background.mjs';

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
// For ANY alphabet seed: each eligible result <= previous global max - 1; all other
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
test('binary cells take the XOR of the binary cells in their 3x3 block and age by one tick', () => {
  const zeros = referenceStep(Uint32Array.from([0,0,0, ONE,ZERO,ONE, 0,0,0]), 3, 3);
  assert.deepEqual([...zeros].map(state), [0,ZERO,0, 0,ZERO,0, 0,ZERO,0]);
  const ones = referenceStep(Uint32Array.from([0,0,0, ONE,ZERO,ZERO, 0,0,0]), 3, 3);
  assert.deepEqual([...ones].map(state), [0,ONE,0, 0,ONE,0, 0,ONE,0]);
  assert.deepEqual([...ones].filter(Boolean).map((value) => value >>> AGE_SHIFT), [1, 1, 1]);
});
test('a live cell whose block holds a binary and an alphabet symbol becomes the oldest symbol', () => {
  assert.deepEqual([...referenceStep(Uint32Array.from([0,0,0, ONE,5,ZERO, 0,0,0]), 3, 3)], [0,OLDEST,0, 0,OLDEST,0, 0,OLDEST,0]);
  // A binary cell with only alphabet neighbours collides too: its own block holds both kinds.
  assert.deepEqual([...referenceStep(Uint32Array.from([0,0,0, 3,ONE,7, 0,0,0]), 3, 3)], [0,OLDEST,0, 0,OLDEST,0, 0,OLDEST,0]);
  // Alphabet-only blocks keep decaying as before.
  assert.deepEqual([...referenceStep(Uint32Array.from([0,0,0, 3,9,7, 0,0,0]), 3, 3)], [0,8,0, 0,8,0, 0,8,0]);
});
test('binary cells do not decay but die at the age cap', () => {
  let block = new Uint32Array(16);
  for (const index of [5, 6, 9, 10]) block[index] = ONE;
  for (let tick = 0; tick < 50; tick++) block = referenceStep(block, 4, 4);
  assert.deepEqual([5, 6, 9, 10].map((index) => state(block[index])), [ZERO, ZERO, ZERO, ZERO]);
  assert.equal(block[5] >>> AGE_SHIFT, 50);
  const old = new Uint32Array(16);
  for (const index of [5, 6, 9, 10]) old[index] = ONE | ((MAX_BINARY_AGE - 2) << AGE_SHIFT);
  const survivor = referenceStep(old, 4, 4);
  assert.equal(survivor.filter(Boolean).length, 4);
  assert.deepEqual(referenceStep(survivor, 4, 4), new Uint32Array(16));
});
test('an up-right glider moves one cell up and right every 4 ticks and its symbols keep alternating', () => {
  const size = 24;
  for (const bits of GLIDER_BITS) {
    let cells = new Uint32Array(size * size);
    UP_RIGHT_GLIDER.forEach(([dx, dy], i) => { cells[(18 + dy) * size + 2 + dx] = (bits >> i) & 1 ? ONE : ZERO; });
    let sawZero = false;
    for (let tick = 1; tick <= 60; tick++) {
      cells = referenceStep(cells, size, size);
      const live = [...cells.keys()].filter((index) => cells[index]);
      assert.equal(live.length, 5, `bits ${bits}, tick ${tick}: still a glider`);
      assert.ok(live.some((index) => state(cells[index]) === ONE), `bits ${bits}, tick ${tick}: never all '0'`);
      if (live.some((index) => state(cells[index]) === ZERO)) sawZero = true;
      if (tick % 4 === 0) {
        const shift = tick / 4;
        const expected = UP_RIGHT_GLIDER.map(([dx, dy]) => (18 + dy - shift) * size + 2 + dx + shift).sort((a, b) => a - b);
        assert.deepEqual(live, expected);
      }
    }
    assert.ok(sawZero, `bits ${bits}: both symbols appear`);
  }
});
test('pattern 24 is the only start that settles on all zeros, so gliders never use it', () => {
  assert.deepEqual([...GLIDER_BITS], Array.from({ length: 31 }, (_, i) => i + 1).filter((bits) => bits !== 24));
  const size = 24;
  let cells = new Uint32Array(size * size);
  UP_RIGHT_GLIDER.forEach(([dx, dy], i) => { cells[(18 + dy) * size + 2 + dx] = (24 >> i) & 1 ? ONE : ZERO; });
  for (let tick = 0; tick < 2; tick++) cells = referenceStep(cells, size, size);
  assert.ok([...cells].filter(Boolean).every((value) => state(value) === ZERO));
});
test('the shader implements the same rule as the oracle', () => {
  for (const snippet of ['if (binary && alphabet)', `result = ${OLDEST}u;`, `(${ZERO}u + (ones & 1u))`, `${MAX_BINARY_AGE}u`, 'result = oldest - 1u;']) {
    assert.ok(LIFE_SHADER.includes(snippet), snippet);
  }
});
test('API validates sizes, cells and glider shapes', async () => {
  assert.throws(() => validateSize(0, 10), RangeError);
  assert.throws(() => validateSize(1.5, 10), RangeError);
  assert.deepEqual(GLIDER, [[1,0], [2,1], [0,2], [1,2], [2,2]]);
  assert.equal(new Set(GLIDER.map(String)).size, 5);
  assert.deepEqual(new Set(UP_RIGHT_GLIDER.map(String)), new Set(GLIDER.map(([x, y]) => String([x, 2 - y]))));
  for (const value of [0, 1, 15, ZERO, ONE, ONE | (7 << AGE_SHIFT)]) assert.ok(isCell(value), String(value));
  for (const value of [18, 255, 15 | (1 << AGE_SHIFT), ZERO | (MAX_BINARY_AGE << AGE_SHIFT)]) assert.ok(!isCell(value), String(value));
  await assert.rejects(createLifeSimulation({ width: -1, height: 10 }), RangeError);
});
