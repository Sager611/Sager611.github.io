export const GLYPH_SCALE = 1;
export const GLYPH_OPACITY = 0.28;
export const GLYPH_SHADER = /* wgsl */ `
struct Settings { grid: vec2f, pad: vec2f, ink: vec4f }
@group(0) @binding(0) var<storage, read> cells: array<u32>;
@group(0) @binding(1) var<uniform> settings: Settings;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var atlasSampler: sampler;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) live: u32 }
@vertex fn vertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instance: u32) -> Vertex {
  let corners = array<vec2f, 6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
  let corner = corners[vertexIndex];
  let state = min(cells[instance], 15u);
  let cell = vec2f(f32(instance % u32(settings.grid.x)), f32(instance / u32(settings.grid.x)));
  let point = (cell + vec2f(0.5) + (corner - vec2f(0.5)) * ${GLYPH_SCALE}) / settings.grid;
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
  let uv = vec2f((f32(max(in.live, 1u) - 1u) * tile + 0.5 + in.uv.x * (tile - 1.0)) / (15.0 * tile), (0.5 + in.uv.y * (tile - 1.0)) / tile);
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
    const response = await fetch('/media/life-glyphs.svg', { signal });
    if (!response.ok) throw new Error('Glyph atlas unavailable');
    url = URL.createObjectURL(await response.blob());
    const image = new Image();
    image.src = url;
    await image.decode();
    signal?.throwIfAborted();
    if (image.naturalWidth !== 480 || image.naturalHeight !== 32) throw new Error('Invalid glyph atlas dimensions');
    const raster = document.createElement('canvas');
    texture = device.createTexture({ size: [480, 32], mipLevelCount: 6, format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    // Initialization-only atlas filtering, not CPU simulation or frame readback.
    for (let mipLevel = 0; mipLevel < 6; mipLevel++) {
      const tile = 32 >> mipLevel;
      raster.width = 15 * tile; raster.height = tile;
      const painter = raster.getContext('2d');
      painter.imageSmoothingEnabled = true;
      painter.imageSmoothingQuality = 'high';
      for (let glyph = 0; glyph < 15; glyph++) {
        painter.drawImage(image, glyph * 32, 0, 32, 32, glyph * tile, 0, tile, tile);
      }
      device.queue.copyExternalImageToTexture({ source: raster }, { texture, mipLevel }, [15 * tile, tile]);
    }
    uniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
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
      render(simulation, ink) {
        const buffer = simulation.currentBuffer;
        let group = groups.get(buffer);
        if (!group) {
          group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer } }, { binding: 1, resource: { buffer: uniform } },
            { binding: 2, resource: texture.createView() }, { binding: 3, resource: sampler },
          ] });
          groups.set(buffer, group);
        }
        device.queue.writeBuffer(uniform, 0, new Float32Array([simulation.width, simulation.height, 0, 0, ...ink, GLYPH_OPACITY]));
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: [0,0,0,0], loadOp: 'clear', storeOp: 'store' }] });
        pass.setPipeline(pipeline); pass.setBindGroup(0, group);
        pass.draw(6, simulation.width * simulation.height); pass.end();
        device.queue.submit([encoder.finish()]);
      }, destroy,
    };
  } catch (error) { destroy(); throw error; }
  finally { if (url) URL.revokeObjectURL(url); }
}
