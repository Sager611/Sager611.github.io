import { createLifeSimulation } from './gpu-life.mjs';
import { createLifeRenderer } from './renderer.mjs';

// 1.5x larger than the former 6.6px pitch; full-cell quads remain tightly packed.
export const CELL_PITCH_PX = 9.9;
export const MAX_GRID_WIDTH = 356;
export const MAX_GRID_HEIGHT = 267;
/** Hidden cells on every side of the visible grid: gliders are born in the left and bottom
 * bands and wiped in the top and right bands, so they never touch the grid edge. */
export const GRID_MARGIN = 8;
/** Expected new gliders per tick, per visible cell along the left and bottom edges. */
export const GLIDER_RATE = 1 / 1600;
/** Gliders closer than this (|lane gap| + |trail gap|, in cells) could interact; spawns keep apart. */
export const GLIDER_SPACING = 18;
/** Starting '0'/'1' patterns (bit i = cell i of UP_RIGHT_GLIDER) whose XOR never settles on all
 * '0': every non-zero pattern except 24, which turns all '0' after two ticks (see life-rules tests). */
export const GLIDER_BITS = Object.freeze(Array.from({ length: 31 }, (_, i) => i + 1).filter((bits) => bits !== 24));

export function backgroundSize(width, height, dpr = 1) {
  const w = Math.max(1, Math.min(3520, width));
  const h = Math.max(1, Math.min(2640, height));
  const scale = Math.max(1, Math.min(2, dpr, 4096 / w, 4096 / h));
  return { width: Math.min(MAX_GRID_WIDTH, Math.max(3, Math.ceil(w / CELL_PITCH_PX))), height: Math.min(MAX_GRID_HEIGHT, Math.max(3, Math.ceil(h / CELL_PITCH_PX))), pixelsWidth: Math.min(4096, Math.round(w * scale)), pixelsHeight: Math.min(4096, Math.round(h * scale)) };
}

/** Simulation grid: the visible cells plus GRID_MARGIN hidden cells on every side. */
export function gridLayout(visibleWidth, visibleHeight, margin = GRID_MARGIN) {
  return { width: visibleWidth + 2 * margin, height: visibleHeight + 2 * margin, left: margin, top: margin, visibleWidth, visibleHeight };
}

/** Plans up-right binary gliders: births just outside the left and bottom edges, and a 5x5 wipe
 * once a glider has fully left through the top or right edge. All gliders share one velocity,
 * so gliders apart at birth stay apart: lane = x + y and drift = x - y - generation / 2 are
 * constant along a glider's path. Pure planning; the caller writes to the GPU. */
export function createGliderSpawner(layout, { rng = Math.random, rate = GLIDER_RATE } = {}) {
  const { left, top, visibleWidth, visibleHeight } = layout;
  const first = left + top, corner = left + top + visibleHeight - 1, last = corner + visibleWidth - 1;
  const active = [];
  let budget = 0;
  const entry = (lane) => {
    if (lane <= corner) return [left - 4, lane - left + 4];
    const y = top + visibleHeight + 1;
    return [lane - y, y];
  };
  return {
    get active() { return active.length; },
    /** Call once per tick before step(); returns { spawns: [[x, y, bits]], clears: [[x, y, w, h]] }. */
    tick(generation) {
      const clears = [];
      for (let i = active.length - 1; i >= 0; i--) {
        const glider = active[i];
        const steps = Math.floor((generation - glider.generation) / 4);
        const x = glider.x + steps, y = glider.y - steps;
        if (y + 3 < top || x - 1 >= left + visibleWidth) {
          clears.push([x - 1, y - 1, 5, 5]);
          active.splice(i, 1);
        }
      }
      const spawns = [];
      budget += (visibleWidth + visibleHeight) * rate;
      while (budget >= 1) {
        budget -= 1;
        const lane = first + Math.floor(rng() * (last - first + 1));
        const [x, y] = entry(lane);
        const drift = x - y - generation / 2;
        if (active.some((glider) => Math.abs(glider.lane - lane) + Math.abs(glider.drift - drift) < GLIDER_SPACING)) continue;
        active.push({ lane, drift, x, y, generation });
        spawns.push([x, y, GLIDER_BITS[Math.floor(rng() * GLIDER_BITS.length)]]);
      }
      return { spawns, clears };
    },
  };
}

export const STEP_INTERVAL_MS = 200 / 1.75;
export const POINTER_INTERVAL_MS = 22.5;
export const POINTER_DISTANCE_PX = 4.5;

/** 19x19 replacement brush centered at pointer; exactly 126 live cells before clipping. */
export function stampPointerRandom(simulation, cellX, cellY) {
  simulation.stampRandom(cellX, cellY, { size: 19 });
}

/** Synchronous teardown, including when initialization is still pending. No retry/fallback.
 * A canvas with data-gliders="true" (the landing page) streams binary gliders in from off-screen. */
export function startLifeBackground(canvas) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const gliders = canvas.dataset.gliders === 'true';
  canvas.dataset.generation = '0';
  if (motion.matches || !navigator.gpu) {
    canvas.dataset.status = motion.matches ? 'reduced-motion' : 'unsupported';
    return () => {};
  }
  let stopped = false, device, renderer, simulation, layout, spawner = null, frame = 0, resizeTimer = 0;
  let lastStep = 0, lastStamp = -Infinity, lastX = -Infinity, lastY = -Infinity, resizing = false;
  const abort = new AbortController();
  const inkCanvas = document.createElement('canvas');
  inkCanvas.width = inkCanvas.height = 1;
  const inkContext = inkCanvas.getContext('2d', { willReadFrequently: true });
  const ink = () => {
    inkContext.clearRect(0, 0, 1, 1);
    inkContext.fillStyle = getComputedStyle(document.body).color;
    inkContext.fillRect(0, 0, 1, 1);
    return [...inkContext.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => value / 255);
  };
  const view = () => ({ left: layout.left, top: layout.top, width: layout.visibleWidth, height: layout.visibleHeight });
  const cleanup = (status = 'stopped') => {
    if (stopped) return;
    stopped = true; abort.abort(); cancelAnimationFrame(frame); clearTimeout(resizeTimer);
    window.removeEventListener('pointermove', pointer);
    window.removeEventListener('touchstart', touch);
    window.removeEventListener('touchmove', touch);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', visibility);
    motion.removeEventListener('change', reduced);
    device?.removeEventListener('uncapturederror', gpuError);
    simulation?.destroy(); renderer?.destroy(); device?.destroy();
    canvas.width = 1; canvas.height = 1; canvas.dataset.status = status;
  };
  const reduced = () => { if (motion.matches) cleanup('reduced-motion'); };
  const gpuError = () => cleanup('error');
  const tick = (now) => {
    if (stopped || document.hidden || resizing) return;
    try {
      if (now - lastStep >= STEP_INTERVAL_MS) {
        if (spawner) {
          const { spawns, clears } = spawner.tick(simulation.generation);
          for (const [x, y, w, h] of clears) simulation.clearRect(x, y, w, h);
          for (const [x, y, bits] of spawns) simulation.stampBinaryGlider(x, y, bits);
        }
        simulation.step();
        renderer.render(simulation, ink(), view());
        canvas.dataset.generation = String(simulation.generation); lastStep = now;
      }
      frame = requestAnimationFrame(tick);
    } catch { cleanup('error'); }
  };
  const visibility = () => {
    cancelAnimationFrame(frame);
    if (!stopped && simulation && !resizing && !document.hidden) {
      lastStep = performance.now(); frame = requestAnimationFrame(tick);
      canvas.dataset.status = 'running';
    } else if (!stopped) canvas.dataset.status = 'paused';
  };
  const rebuild = async () => {
    resizing = true; cancelAnimationFrame(frame);
    const size = backgroundSize(innerWidth, innerHeight, devicePixelRatio);
    const nextLayout = gridLayout(size.width, size.height);
    const next = await createLifeSimulation({ width: nextLayout.width, height: nextLayout.height, device });
    if (stopped) { next.destroy(); return; }
    simulation?.destroy(); simulation = next; layout = nextLayout;
    spawner = gliders ? createGliderSpawner(layout) : null;
    canvas.width = Math.min(size.pixelsWidth, device.limits.maxTextureDimension2D);
    canvas.height = Math.min(size.pixelsHeight, device.limits.maxTextureDimension2D);
    // WebGPU buffers start zeroed. A rebuild starts empty; gliders (if enabled) arrive from the next tick.
    renderer.render(simulation, ink(), view()); canvas.dataset.generation = '0';
    resizing = false; visibility();
  };
  const resize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!stopped && !resizing) rebuild().catch(() => cleanup('error')); }, 180);
  };
  // Stamp at a viewport point: mouse or pen hover, or a finger dragged across the screen.
  const paint = (clientX, clientY) => {
    if (stopped || !simulation || resizing || document.hidden) return;
    const now = performance.now();
    if (now - lastStamp < POINTER_INTERVAL_MS || Math.hypot(clientX - lastX, clientY - lastY) < POINTER_DISTANCE_PX) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.floor((clientX - rect.left) / rect.width * layout.visibleWidth);
    const y = Math.floor((clientY - rect.top) / rect.height * layout.visibleHeight);
    if (x < 0 || y < 0 || x >= layout.visibleWidth || y >= layout.visibleHeight) return;
    try { stampPointerRandom(simulation, x + layout.left, y + layout.top); lastStamp = now; lastX = clientX; lastY = clientY; }
    catch { cleanup('error'); }
  };
  // Touch pointer events end in pointercancel once the page scrolls, so fingers use touch events.
  const pointer = (event) => { if (event.pointerType !== 'touch') paint(event.clientX, event.clientY); };
  const touch = (event) => { for (const point of Array.from(event.changedTouches ?? [])) paint(point.clientX, point.clientY); };
  canvas.dataset.status = 'initializing';
  motion.addEventListener('change', reduced);
  document.addEventListener('visibilitychange', visibility);
  (async () => {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
      if (stopped) return;
      if (!adapter) { cleanup('unsupported'); return; }
      const acquired = await adapter.requestDevice();
      if (stopped) { acquired.destroy(); return; }
      device = acquired;
      device.addEventListener('uncapturederror', gpuError);
      device.lost.then(() => cleanup('device-lost'));
      const created = await createLifeRenderer(canvas, device, { signal: abort.signal });
      if (stopped) { created.destroy(); return; }
      renderer = created;
      await rebuild();
      if (stopped) return;
      window.addEventListener('pointermove', pointer, { passive: true });
      window.addEventListener('touchstart', touch, { passive: true });
      window.addEventListener('touchmove', touch, { passive: true });
      window.addEventListener('resize', resize, { passive: true });
    } catch { cleanup('error'); }
  })();
  return () => cleanup();
}
