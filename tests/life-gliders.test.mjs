import test from 'node:test';
import assert from 'node:assert/strict';
import { gridLayout, createGliderSpawner, GRID_MARGIN, GLIDER_RATE, GLIDER_SPACING, GLIDER_BITS } from '../src/lib/life/background.mjs';
import { UP_RIGHT_GLIDER, ZERO, ONE } from '../src/lib/life/gpu-life.mjs';
import { referenceStep, state } from './life-reference.mjs';

function seeded(seed) {
  let value = seed >>> 0 || 1;
  return () => {
    value ^= value << 13; value >>>= 0;
    value ^= value >>> 17;
    value ^= value << 5; value >>>= 0;
    return value / 4294967296;
  };
}

const inView = (layout, x, y) => x >= layout.left && y >= layout.top && x < layout.left + layout.visibleWidth && y < layout.top + layout.visibleHeight;

test('the grid adds hidden margins on every side of the visible cells', () => {
  assert.deepEqual(gridLayout(10, 6), { width: 10 + 2 * GRID_MARGIN, height: 6 + 2 * GRID_MARGIN, left: GRID_MARGIN, top: GRID_MARGIN, visibleWidth: 10, visibleHeight: 6 });
});

test('gliders are born fully off-screen, left of or below the view, at a rate set by the edge length', () => {
  for (const [width, height] of [[3, 3], [40, 25], [146, 91], [356, 267]]) {
    const layout = gridLayout(width, height);
    const spawner = createGliderSpawner(layout, { rng: seeded(width * 31 + height) });
    let count = 0;
    for (let generation = 0; generation < 4000; generation++) {
      for (const [x, y, bits] of spawner.tick(generation).spawns) {
        count++;
        assert.ok(GLIDER_BITS.includes(bits), String(bits));
        for (const [dx, dy] of UP_RIGHT_GLIDER) {
          const cx = x + dx, cy = y + dy;
          assert.ok(cx > 0 && cy > 0 && cx < layout.width - 1 && cy < layout.height - 1, 'inside the grid, off its edge');
          assert.ok(!inView(layout, cx, cy), 'outside the view');
          assert.ok(cx < layout.left || cy >= layout.top + height, 'left of or below the view');
        }
      }
    }
    const expected = 4000 * (width + height) * GLIDER_RATE;
    assert.ok(count <= Math.ceil(expected), `${width}x${height}: ${count} <= ${expected}`);
    assert.ok(count >= expected * 0.3, `${width}x${height}: ${count} >= 30% of ${expected}`);
  }
});

test('two live gliders are always far enough apart never to interact', () => {
  const layout = gridLayout(146, 91);
  const spawner = createGliderSpawner(layout, { rng: seeded(7), rate: GLIDER_RATE * 4 });
  const live = [];
  for (let generation = 0; generation < 3000; generation++) {
    const { spawns, clears } = spawner.tick(generation);
    for (const [cx, cy] of clears) {
      const index = live.findIndex((glider) => {
        const steps = Math.floor((generation - glider.generation) / 4);
        return glider.x + steps - 1 === cx && glider.y - steps - 1 === cy;
      });
      assert.ok(index >= 0, 'each wipe removes a live glider');
      live.splice(index, 1);
    }
    for (const [x, y] of spawns) {
      const glider = { x, y, generation, lane: x + y, drift: x - y - generation / 2 };
      for (const other of live) assert.ok(Math.abs(other.lane - glider.lane) + Math.abs(other.drift - glider.drift) >= GLIDER_SPACING);
      live.push(glider);
    }
    assert.equal(spawner.active, live.length);
  }
});

test('end to end: gliders cross the view intact and are wiped off-screen before the grid edge', () => {
  for (const [width, height] of [[3, 3], [30, 18], [18, 30]]) {
    const layout = gridLayout(width, height);
    const spawner = createGliderSpawner(layout, { rng: seeded(width * 7 + height), rate: GLIDER_RATE * 8 });
    let cells = new Uint32Array(layout.width * layout.height);
    let spawned = 0, seenInView = 0;
    for (let generation = 0; generation < 1500; generation++) {
      const { spawns, clears } = spawner.tick(generation);
      for (const [cx, cy, w, h] of clears) {
        assert.ok(cx >= 0 && cy >= 0 && cx + w <= layout.width && cy + h <= layout.height, 'wipes stay inside the grid');
        for (let y = cy; y < cy + h; y++) for (let x = cx; x < cx + w; x++) {
          assert.ok(!inView(layout, x, y), 'wipes stay off-screen');
          cells[y * layout.width + x] = 0;
        }
      }
      for (const [x, y, bits] of spawns) {
        UP_RIGHT_GLIDER.forEach(([dx, dy], i) => { cells[(y + dy) * layout.width + x + dx] = (bits >> i) & 1 ? ONE : ZERO; });
      }
      spawned += spawns.length;
      cells = referenceStep(cells, layout.width, layout.height);
      let live = 0;
      for (let y = 0; y < layout.height; y++) for (let x = 0; x < layout.width; x++) {
        const value = state(cells[y * layout.width + x]);
        if (!value) continue;
        live++;
        assert.ok(value === ZERO || value === ONE, 'only binary cells');
        assert.ok(x > 0 && y > 0 && x < layout.width - 1 && y < layout.height - 1, `generation ${generation}: a glider reached the grid edge at ${x},${y}`);
        if (inView(layout, x, y)) seenInView++;
      }
      assert.equal(live, 5 * spawner.active, `generation ${generation}: every live cell belongs to an intact glider`);
    }
    assert.ok(spawned > 0 && seenInView > 0, `${width}x${height}: gliders crossed the view`);
  }
});
