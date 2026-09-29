export const GLYPH_SCALE = 1;
export const GLYPH_OPACITY = 0.28;
/** Atlas tiles: states 1..15 (alphabet, oldest = 15) and 16, 17 (binary '0', '1'). */
export const GLYPH_COUNT = 17;
export const ATLAS_WIDTH = GLYPH_COUNT * 32;
/** Hash of public/media/life-glyphs.svg, so no browser or CDN cache pairs this code with another atlas (tested). */
export const ATLAS_URL = '/media/life-glyphs.svg?v=a31712a2';
export const GLYPH_SHADER = /* wgsl */ `
struct Settings { view: vec2f, origin: vec2f, ink: vec4f, stride: vec4f }
@group(0) @binding(0) var<storage, read> cells: array<u32>;
@group(0) @binding(1) var<uniform> settings: Settings;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var atlasSampler: sampler;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) live: u32 }
@vertex fn vertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instance: u32) -> Vertex {
  let corners = array<vec2f, 6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
  let corner = corners[vertexIndex];
  // Draw only the visible window; the hidden margins hold incoming and outgoing gliders.
  let columns = u32(settings.view.x);
  let cell = vec2f(f32(instance % columns), f32(instance / columns));
  let source = vec2u(cell + settings.origin);
  let state = min(cells[source.y * u32(settings.stride.x) + source.x] & 255u, ${GLYPH_COUNT}u);
  let point = (cell + vec2f(0.5) + (corner - vec2f(0.5)) * ${GLYPH_SCALE}) / settings.view;
  var out: Vertex;
  out.position = vec4f(point.x * 2.0 - 1.0, 1.0 - point.y * 2.0, 0, 1);
  out.uv = corner;
  out.live = state;
  return out;
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
  // Derivatives precede discard; select a prefiltered, tile-isolated mip.
  let footprint = max(length(dpdx(in.uv) * 32.0), length(dpdy(in.uv) * 32.0));
  let lod = clamp(round(log2(max(footprint, 1.0))), 0.0, 5.0);
  let tile = 32.0 / exp2(lod);
  let uv = vec2f((f32(max(in.live, 1u) - 1u) * tile + 0.5 + in.uv.x * (tile - 1.0)) / (${GLYPH_COUNT}.0 * tile), (0.5 + in.uv.y * (tile - 1.0)) / tile);
  if (in.live == 0u) { discard; }
  let alpha = textureSampleLevel(atlas, atlasSampler, uv, lod).a * settings.ink.a;
  return vec4f(settings.ink.rgb * alpha, alpha);
}`;

/** Shared device; rendering reads the latest ping-pong buffer, never readback. */
export async function createLifeRenderer(canvas, device, { signal } = {}) {
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('WebGPU canvas unavailable');
  let texture, uniform, url;
  const destroy = () => { texture?.destroy(); uniform?.destroy(); context.unconfigure(); };
  try {
    const response = await fetch(ATLAS_URL, { signal });
    if (!response.ok) throw new Error('Glyph atlas unavailable');
    url = URL.createObjectURL(await response.blob());
    const image = new Image();
    image.src = url;
    await image.decode();
    signal?.throwIfAborted();
    if (image.naturalWidth !== ATLAS_WIDTH || image.naturalHeight !== 32) throw new Error('Invalid glyph atlas dimensions');
    const raster = document.createElement('canvas');
    texture = device.createTexture({ size: [ATLAS_WIDTH, 32], mipLevelCount: 6, format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    // Initialization-only atlas filtering, not CPU simulation or frame readback.
    for (let mipLevel = 0; mipLevel < 6; mipLevel++) {
      const tile = 32 >> mipLevel;
      raster.width = GLYPH_COUNT * tile; raster.height = tile;
      const painter = raster.getContext('2d');
      painter.imageSmoothingEnabled = true;
      painter.imageSmoothingQuality = 'high';
      for (let glyph = 0; glyph < GLYPH_COUNT; glyph++) {
        painter.drawImage(image, glyph * 32, 0, 32, 32, glyph * tile, 0, tile, tile);
      }
      device.queue.copyExternalImageToTexture({ source: raster }, { texture, mipLevel }, [GLYPH_COUNT * tile, tile]);
    }
    uniform = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const format = navigator.gpu.getPreferredCanvasFormat();
    const module = device.createShaderModule({ code: GLYPH_SHADER });
    const pipeline = await device.createRenderPipelineAsync({
      layout: 'auto', vertex: { module, entryPoint: 'vertex' },
      fragment: { module, entryPoint: 'fragment', targets: [{ format, blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      } }] }, primitive: { topology: 'triangle-list' },
    });
    signal?.throwIfAborted();
    context.configure({ device, format, alphaMode: 'premultiplied' });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const groups = new WeakMap();
    return {
      render(simulation, ink, view = { left: 0, top: 0, width: simulation.width, height: simulation.height }) {
        const buffer = simulation.currentBuffer;
        let group = groups.get(buffer);
        if (!group) {
          group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer } }, { binding: 1, resource: { buffer: uniform } },
            { binding: 2, resource: texture.createView() }, { binding: 3, resource: sampler },
          ] });
          groups.set(buffer, group);
        }
        device.queue.writeBuffer(uniform, 0, new Float32Array([view.width, view.height, view.left, view.top, ...ink, GLYPH_OPACITY, simulation.width, 0, 0, 0]));
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: [0,0,0,0], loadOp: 'clear', storeOp: 'store' }] });
        pass.setPipeline(pipeline); pass.setBindGroup(0, group);
        pass.draw(6, view.width * view.height); pass.end();
        device.queue.submit([encoder.finish()]);
      }, destroy,
    };
  } catch (error) { destroy(); throw error; }
  finally { if (url) URL.revokeObjectURL(url); }
}
