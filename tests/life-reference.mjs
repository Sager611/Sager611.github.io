import { OLDEST, ZERO, ONE, STATE_MASK, AGE_SHIFT, MAX_BINARY_AGE } from '../src/lib/life/gpu-life.mjs';

/** Test-only CPU oracle mirroring LIFE_SHADER. Production never imports or runs a CPU simulation. */
export function referenceStep(cells, width, height) {
  const next = new Uint32Array(cells.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let count = 0, oldest = 0, ones = 0, age = 0, binary = false, alphabet = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx < 0 || y + dy < 0 || x + dx >= width || y + dy >= height) continue;
      const value = cells[(y + dy) * width + x + dx];
      const kind = value & STATE_MASK;
      if (!kind) continue;
      if (dx || dy) count++;
      if (kind >= ZERO) { binary = true; age = Math.max(age, value >>> AGE_SHIFT); if (kind === ONE) ones++; }
      else { alphabet = true; oldest = Math.max(oldest, kind); }
    }
    const index = y * width + x;
    if (!(count === 3 || ((cells[index] & STATE_MASK) > 0 && count === 2))) continue;
    if (binary && alphabet) next[index] = OLDEST;
    else if (binary) { if (age + 1 < MAX_BINARY_AGE) next[index] = (ZERO + (ones & 1)) | ((age + 1) << AGE_SHIFT); }
    else next[index] = oldest - 1;
  }
  return next;
}

/** The state of a cell without its age bits. */
export const state = (value) => value & STATE_MASK;
