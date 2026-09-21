import { createLifeSimulation } from './gpu-life.mjs';
import { createLifeRenderer } from './renderer.mjs';

// 1.5x larger than the former 6.6px pitch; full-cell quads remain tightly packed.
export const CELL_PITCH_PX = 9.9;
export const MAX_GRID_WIDTH = 356;
export const MAX_GRID_HEIGHT = 267;

export function backgroundSize(width, height, dpr = 1) {
  const w = Math.max(1, Math.min(3520, width));
  const h = Math.max(1, Math.min(2640, height));
  const scale = Math.max(1, Math.min(2, dpr, 4096 / w, 4096 / h));
  return { width: Math.min(MAX_GRID_WIDTH, Math.max(3, Math.ceil(w / CELL_PITCH_PX))), height: Math.min(MAX_GRID_HEIGHT, Math.max(3, Math.ceil(h / CELL_PITCH_PX))), pixelsWidth: Math.min(4096, Math.round(w * scale)), pixelsHeight: Math.min(4096, Math.round(h * scale)) };
}

export const STEP_INTERVAL_MS = 200 / 1.75;
export const POINTER_INTERVAL_MS = 45;
export const POINTER_DISTANCE_PX = 9;

/** 13x13 replacement brush centered at pointer; exactly 59 live cells before clipping. */
export function stampPointerRandom(simulation, cellX, cellY) {
  simulation.stampRandom(cellX, cellY);
}

/** Synchronous teardown, including when initialization is still pending. No retry/fallback. */
export function startLifeBackground(canvas) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  canvas.dataset.generation = '0';
  if (motion.matches || !navigator.gpu) {
    canvas.dataset.status = motion.matches ? 'reduced-motion' : 'unsupported';
    return () => {};
  }
  let stopped = false, device, renderer, simulation, frame = 0, resizeTimer = 0;
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
  const cleanup = (status = 'stopped') => {
    if (stopped) return;
    stopped = true; abort.abort(); cancelAnimationFrame(frame); clearTimeout(resizeTimer);
    window.removeEventListener('pointermove', pointer);
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
        simulation.step();
        renderer.render(simulation, ink());
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
    const next = await createLifeSimulation({ width: size.width, height: size.height, device });
    if (stopped) { next.destroy(); return; }
    simulation?.destroy(); simulation = next;
    canvas.width = Math.min(size.pixelsWidth, device.limits.maxTextureDimension2D);
    canvas.height = Math.min(size.pixelsHeight, device.limits.maxTextureDimension2D);
    // WebGPU buffers start zeroed. Rebuilds stay empty until a mouse stamp.
    renderer.render(simulation, ink()); canvas.dataset.generation = '0';
    resizing = false; visibility();
  };
  const resize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!stopped && !resizing) rebuild().catch(() => cleanup('error')); }, 180);
  };
  const pointer = (event) => {
    if (event.pointerType !== 'mouse' || stopped || !simulation || resizing || document.hidden) return;
    const now = performance.now();
    if (now - lastStamp < POINTER_INTERVAL_MS || Math.hypot(event.clientX - lastX, event.clientY - lastY) < POINTER_DISTANCE_PX) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.floor((event.clientX - rect.left) / rect.width * simulation.width);
    const y = Math.floor((event.clientY - rect.top) / rect.height * simulation.height);
    if (x < 0 || y < 0 || x >= simulation.width || y >= simulation.height) return;
    try { stampPointerRandom(simulation, x, y); lastStamp = now; lastX = event.clientX; lastY = event.clientY; }
    catch { cleanup('error'); }
  };
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
      window.addEventListener('resize', resize, { passive: true });
    } catch { cleanup('error'); }
  })();
  return () => cleanup();
}
