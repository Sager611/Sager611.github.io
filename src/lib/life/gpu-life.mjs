/** GPU-only Life with two kinds of live cells. Row-major u32 cells: the low byte is the
 * state, bits 8 and up hold the age of binary cells.
 *   0        dead
 *   1..15    alphabet glyphs; the value is the remaining lifetime (15 = oldest script)
 *   16, 17   binary glyphs '0' and '1' (ZERO, ONE)
 * Births and survivals follow B3/S23 over all live cells. A cell that lives next tick:
 *   - becomes OLDEST (15) when its 3x3 block (itself + eight neighbours) holds both kinds;
 *   - else, with only binary cells in the block, becomes the XOR of their bits ('1' = 1),
 *     one tick older than the oldest of them;
 *   - else takes the block's highest alphabet lifetime minus one (decays to extinction).
 * Binary cells die at MAX_BINARY_AGE ticks, a safety net for stray debris; gliders leave
 * the grid long before that.
 * Renderer: bind currentBuffer as read-only-storage; it swaps after step().
 * Use the same device/queue; submit rendering after step(). Never readback per frame.
 * Caller owns animation, resize/recreation, visibility/reduced-motion gating and
 * device-loss fallback. This module never changes DOM or hides static content.
 */
export const OLDEST = 15;
export const ZERO = 16;
export const ONE = 17;
export const STATE_MASK = 0xff;
export const AGE_SHIFT = 8;
export const MAX_BINARY_AGE = 3000;

export const LIFE_SHADER = /* wgsl */ `
struct Grid { size: vec2u, padding: vec2u }
@group(0) @binding(0) var<uniform> grid: Grid;
@group(0) @binding(1) var<storage, read> cells: array<u32>;
@group(0) @binding(2) var<storage, read_write> next: array<u32>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= grid.size.x || id.y >= grid.size.y) { return; }
  let index = id.y * grid.size.x + id.x;
  let own = cells[index] & ${STATE_MASK}u;
  var count = 0u;
  var oldest = 0u;
  var ones = 0u;
  var age = 0u;
  var binary = false;
  var alphabet = false;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let p = vec2i(id.xy) + vec2i(dx, dy);
      if (p.x < 0 || p.y < 0 || p.x >= i32(grid.size.x) || p.y >= i32(grid.size.y)) { continue; }
      let value = cells[u32(p.y) * grid.size.x + u32(p.x)];
      let state = value & ${STATE_MASK}u;
      if (state == 0u) { continue; }
      if (dx != 0 || dy != 0) { count++; }
      if (state >= ${ZERO}u) {
        binary = true;
        age = max(age, value >> ${AGE_SHIFT}u);
        if (state == ${ONE}u) { ones++; }
      } else {
        alphabet = true;
        oldest = max(oldest, state);
      }
    }
  }
  var result = 0u;
  if (count == 3u || (own > 0u && count == 2u)) {
    if (binary && alphabet) {
      result = ${OLDEST}u;
    } else if (binary) {
      if (age + 1u < ${MAX_BINARY_AGE}u) { result = (${ZERO}u + (ones & 1u)) | ((age + 1u) << ${AGE_SHIFT}u); }
    } else {
      result = oldest - 1u;
    }
  }
  next[index] = result;
}`;

/** Classic down-right glider, top-left based. */
export const GLIDER = Object.freeze([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]].map(Object.freeze));
/** The same glider mirrored vertically: one column right and one row up every 4 ticks. */
export const UP_RIGHT_GLIDER = Object.freeze([[0, 0], [1, 0], [2, 0], [2, 1], [1, 2]].map(Object.freeze));

/** True for a storable cell: dead, alphabet 1..15 with age 0, or binary younger than the cap. */
export function isCell(value) {
  const state = value & STATE_MASK, age = value >>> AGE_SHIFT;
  return state <= ONE && (state >= ZERO ? age < MAX_BINARY_AGE : age === 0);
}

/** Partial Fisher-Yates: exact occupancy without replacement, bounded CPU stamping only. */
export function randomBrush(size = 13, density = 0.35, rng = Math.random) {
  if (!Number.isInteger(size) || size < 1 || size > 31 || size % 2 !== 1 || !Number.isFinite(density) || density < 0 || density > 1) throw new RangeError('Brush: odd size 1..31, density 0..1');
  const cells = new Uint32Array(size * size);
  const indices = Uint32Array.from({ length: cells.length }, (_, i) => i);
  for (let i = 0; i < Math.round(cells.length * density); i++) {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('RNG must return 0 <= value < 1');
    const j = i + Math.floor(value * (cells.length - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
    cells[indices[i]] = 15;
  }
  return cells;
}

/** Replace the centered footprint, including zeroes; preserve all cells outside it. */
export function writeRandomBrush(width, height, x, y, writeRow, { size = 13, density = 0.35, rng = Math.random } = {}) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) throw new RangeError('Brush coordinates must be integers');
  const cells = randomBrush(size, density, rng);
  const left = x - (size - 1) / 2, top = y - (size - 1) / 2;
  const start = Math.max(0, left), end = Math.min(width, left + size);
  if (end <= start) return;
  for (let py = Math.max(0, top); py < Math.min(height, top + size); py++) {
    const offset = (py - top) * size + start - left;
    writeRow((py * width + start) * 4, cells.subarray(offset, offset + end - start));
  }
}

export function validateSize(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535) {
    throw new RangeError('Life dimensions must be integers in 1..65535');
  }
}

/** Returns null if WebGPU/adapter unavailable; other initialization errors reject.
 * Pass device to share with a renderer. Otherwise this instance owns its device.
 */
export async function createLifeSimulation({ width, height, device: suppliedDevice } = {}) {
  validateSize(width, height);
  let device = suppliedDevice;
  if (!device) {
    const adapter = await globalThis.navigator?.gpu?.requestAdapter({ powerPreference: 'low-power' });
    if (!adapter) return null;
    device = await adapter.requestDevice();
  }
  const ownsDevice = !suppliedDevice;
  const bytes = width * height * 4;
  const resources = [];
  const staging = new Set();
  let destroyed = false;
  let lost = false;
  let phase = 0;
  let generation = 0;
  const deviceLost = device.lost.then((info) => { lost = true; return info; });
  const alive = () => {
    if (destroyed || lost) throw new Error('Life simulation is destroyed or its GPU device was lost');
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    for (const buffer of [...resources, ...staging]) buffer.destroy();
    staging.clear();
    if (ownsDevice) device.destroy();
  };
  try {
    if (bytes > device.limits.maxStorageBufferBindingSize || bytes > device.limits.maxBufferSize ||
        Math.ceil(width / 8) > device.limits.maxComputeWorkgroupsPerDimension ||
        Math.ceil(height / 8) > device.limits.maxComputeWorkgroupsPerDimension) {
      throw new RangeError('Life grid exceeds GPU device limits');
    }
    const makeBuffer = (size, usage) => {
      const buffer = device.createBuffer({ size, usage });
      resources.push(buffer);
      return buffer;
    };
    const buffers = [0, 1].map(() => makeBuffer(bytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST));
    const uniform = makeBuffer(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    device.queue.writeBuffer(uniform, 0, new Uint32Array([width, height, 0, 0]));
    const pipeline = await device.createComputePipelineAsync({
      layout: 'auto', compute: { module: device.createShaderModule({ code: LIFE_SHADER }), entryPoint: 'main' },
    });
    const groups = buffers.map((buffer, index) => device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: { buffer } },
        { binding: 2, resource: { buffer: buffers[1 - index] } },
      ],
    }));
    return {
      width, height, device, deviceLost,
      get currentBuffer() { alive(); return buffers[phase]; },
      get generation() { return generation; },
      /** Replace all cells; input is copied by the GPU queue immediately. */
      upload(seed) {
        alive();
        if (!(seed instanceof Uint32Array) || seed.length !== width * height || !seed.every(isCell)) {
          throw new RangeError('Seed must be a grid-sized Uint32Array of valid cells');
        }
        device.queue.writeBuffer(buffers[phase], 0, seed);
        generation = 0;
      },
      /** Top-left (x, y) of an up-right glider; bit i of `bits` makes cell i of UP_RIGHT_GLIDER a '1'. Clips at edges. */
      stampBinaryGlider(x, y, bits) {
        alive();
        if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(bits) || bits < 0 || bits > 31) {
          throw new RangeError('Binary glider needs integer coordinates and 5 bits');
        }
        UP_RIGHT_GLIDER.forEach(([dx, dy], i) => {
          const px = x + dx, py = y + dy;
          if (px >= 0 && py >= 0 && px < width && py < height) {
            device.queue.writeBuffer(buffers[phase], (py * width + px) * 4, new Uint32Array([(bits >> i) & 1 ? ONE : ZERO]));
          }
        });
      },
      /** Zero a rectangle of cells, clipped to the grid. */
      clearRect(x, y, w, h) {
        alive();
        if (![x, y, w, h].every(Number.isInteger) || w < 0 || h < 0) throw new RangeError('Clear rectangle needs integers');
        const start = Math.max(0, x), end = Math.min(width, x + w);
        if (end <= start) return;
        const zeros = new Uint32Array(end - start);
        for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
          device.queue.writeBuffer(buffers[phase], (py * width + start) * 4, zeros);
        }
      },
      stampRandom(x, y, options) {
        alive();
        writeRandomBrush(width, height, x, y, (offset, row) => device.queue.writeBuffer(buffers[phase], offset, row), options);
      },
      /** Queues generations of the LIFE_SHADER rule. */
      step(count = 1) {
        alive();
        if (!Number.isInteger(count) || count < 0 || count > 1024) throw new RangeError('Step count must be 0..1024');
        if (!count) return;
        const encoder = device.createCommandEncoder();
        for (let i = 0; i < count; i++) {
          const pass = encoder.beginComputePass();
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, groups[phase]);
          pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
          pass.end();
          phase = 1 - phase;
        }
        device.queue.submit([encoder.finish()]);
        generation += count;
      },
      /** QA only: returns a snapshot at invocation time, not a live view. */
      async readback() {
        alive();
        const buffer = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        staging.add(buffer);
        try {
          const encoder = device.createCommandEncoder();
          encoder.copyBufferToBuffer(buffers[phase], 0, buffer, 0, bytes);
          device.queue.submit([encoder.finish()]);
          await buffer.mapAsync(GPUMapMode.READ);
          return new Uint32Array(buffer.getMappedRange().slice(0));
        } finally {
          buffer.destroy();
          staging.delete(buffer);
        }
      },
      destroy,
    };
  } catch (error) {
    destroy();
    throw error;
  }
}
