import type { TransformParams } from '@/app/lib/transforms/types'

const SHADER_VERSION = 9

const SIM_SIZE = 28

let simCanvas: HTMLCanvasElement | null = null

function computeFrameSimilarity(
  a: HTMLImageElement | HTMLVideoElement | ImageBitmap,
  b: HTMLImageElement | HTMLVideoElement | ImageBitmap,
  atlasA: { sx: number; sy: number; sw: number; sh: number },
  atlasB: { sx: number; sy: number; sw: number; sh: number }
): number | null {
  if (typeof document === 'undefined') return null
  if (!simCanvas) {
    simCanvas = document.createElement('canvas')
    simCanvas.width = SIM_SIZE
    simCanvas.height = SIM_SIZE
  }
  const sctx = simCanvas.getContext('2d', { willReadFrequently: true })
  if (!sctx) return null
  if (atlasA.sw < 1 || atlasA.sh < 1 || atlasB.sw < 1 || atlasB.sh < 1) return null
  try {
    sctx.drawImage(a, atlasA.sx, atlasA.sy, atlasA.sw, atlasA.sh, 0, 0, SIM_SIZE, SIM_SIZE)
    const idA = sctx.getImageData(0, 0, SIM_SIZE, SIM_SIZE)
    sctx.drawImage(b, atlasB.sx, atlasB.sy, atlasB.sw, atlasB.sh, 0, 0, SIM_SIZE, SIM_SIZE)
    const idB = sctx.getImageData(0, 0, SIM_SIZE, SIM_SIZE)
    let sumAbs = 0
    const dA = idA.data
    const dB = idB.data
    for (let i = 0; i < dA.length; i += 4) {
      const la = dA[i]! * 0.299 + dA[i + 1]! * 0.587 + dA[i + 2]! * 0.114
      const lb = dB[i]! * 0.299 + dB[i + 1]! * 0.587 + dB[i + 2]! * 0.114
      sumAbs += Math.abs(la - lb)
    }
    const n = SIM_SIZE * SIM_SIZE
    const meanAbs = sumAbs / n
    const sim = 1 - Math.min(1, meanAbs / 72)
    return Math.max(0, Math.min(1, sim))
  } catch {
    return null
  }
}

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `
precision mediump float;
uniform sampler2D u_texA;
uniform sampler2D u_texB;
uniform vec4 u_atlasA;
uniform vec2 u_sizeA;
uniform vec4 u_atlasB;
uniform vec2 u_sizeB;
uniform float u_mix;
uniform float u_phase;
uniform float u_distortAmp;
uniform float u_envelope;
uniform float u_noiseMix;
uniform float u_lumaBoost;
varying vec2 v_uv;

vec4 sampleA(vec2 q) {
  vec2 uv = (u_atlasA.xy + q * u_atlasA.zw) / u_sizeA;
  return texture2D(u_texA, clamp(uv, 0.001, 0.999));
}

vec4 sampleB(vec2 q) {
  vec2 uv = (u_atlasB.xy + q * u_atlasB.zw) / u_sizeB;
  return texture2D(u_texB, clamp(uv, 0.001, 0.999));
}

float h21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float n2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
    mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec2 noiseVectorField(vec2 q, float ph) {
  vec2 p0 = q * vec2(2.6, 4.0) + vec2(ph * 0.42, ph * 0.65);
  vec2 v0 = (vec2(n2(p0), n2(p0 + vec2(4.2, 1.1))) - 0.5) * 2.0;
  vec2 p1 = q * vec2(5.8, 7.2) + vec2(ph * -0.75, ph * 0.95);
  vec2 v1 = (vec2(n2(p1), n2(p1 + vec2(6.8, 2.9))) - 0.5) * 2.0;
  return v0 * 0.82 + v1 * 0.22;
}

float lumA(vec2 qq) {
  return dot(sampleA(qq).rgb, vec3(0.299, 0.587, 0.114));
}

float lumB(vec2 qq) {
  return dot(sampleB(qq).rgb, vec3(0.299, 0.587, 0.114));
}

vec2 lumaFlowField(vec2 q) {
  float e = 0.005;
  float gxa = lumA(q + vec2(e, 0.0)) - lumA(q - vec2(e, 0.0));
  float gxb = lumB(q + vec2(e, 0.0)) - lumB(q - vec2(e, 0.0));
  float gya = lumA(q + vec2(0.0, e)) - lumA(q - vec2(0.0, e));
  float gyb = lumB(q + vec2(0.0, e)) - lumB(q - vec2(0.0, e));
  return vec2(gxa + gxb, gya + gyb) * 0.16;
}

void main() {
  vec2 q = v_uv;
  float blendT = smoothstep(0.04, 0.96, u_mix);

  vec2 nField = noiseVectorField(q, u_phase);
  vec2 fField = lumaFlowField(q);
  vec2 distField = nField * (0.82 * u_noiseMix) + fField * (0.54 * u_lumaBoost);
  float rippleTaper = 1.0 - smoothstep(0.38, 0.88, blendT);
  float settle = rippleTaper * rippleTaper * (3.0 - 2.0 * rippleTaper);
  vec2 D = distField * u_distortAmp * u_envelope * settle;

  vec3 flatBlend = mix(sampleA(q).rgb, sampleB(q).rgb, blendT);

  vec2 pA = q + D * (1.0 - blendT);
  vec2 pB = q - D * blendT;
  vec3 warpBlend = mix(sampleA(pA).rgb, sampleB(pB).rgb, blendT);

  float warpVis = min(1.0, u_envelope * settle * 1.12);
  vec3 col = mix(flatBlend, warpBlend, warpVis);

  float e = 0.0022;
  vec3 s1 = mix(sampleA(pA + vec2(e, 0.0)).rgb, sampleB(pB - vec2(e, 0.0)).rgb, blendT);
  vec3 s2 = mix(sampleA(pA - vec2(e, 0.0)).rgb, sampleB(pB + vec2(e, 0.0)).rgb, blendT);
  vec3 s3 = mix(sampleA(pA + vec2(0.0, e)).rgb, sampleB(pB - vec2(0.0, e)).rgb, blendT);
  vec3 s4 = mix(sampleA(pA - vec2(0.0, e)).rgb, sampleB(pB + vec2(0.0, e)).rgb, blendT);
  col = (col + s1 + s2 + s3 + s4) * 0.2;

  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh)
    return null
  }
  return sh
}

function texDims(el: HTMLImageElement | HTMLVideoElement | ImageBitmap): { w: number; h: number } {
  if (el instanceof HTMLImageElement) return { w: el.naturalWidth, h: el.naturalHeight }
  if (el instanceof HTMLVideoElement) return { w: el.videoWidth, h: el.videoHeight }
  return { w: el.width, h: el.height }
}

type GLCache = {
  version: number
  canvas: HTMLCanvasElement
  gl: WebGLRenderingContext
  program: WebGLProgram
  loc: {
    a_pos: number
    u_texA: WebGLUniformLocation | null
    u_texB: WebGLUniformLocation | null
    u_atlasA: WebGLUniformLocation | null
    u_sizeA: WebGLUniformLocation | null
    u_atlasB: WebGLUniformLocation | null
    u_sizeB: WebGLUniformLocation | null
    u_mix: WebGLUniformLocation | null
    u_phase: WebGLUniformLocation | null
    u_distortAmp: WebGLUniformLocation | null
    u_envelope: WebGLUniformLocation | null
    u_noiseMix: WebGLUniformLocation | null
    u_lumaBoost: WebGLUniformLocation | null
  }
  buf: WebGLBuffer
  texA: WebGLTexture
  texB: WebGLTexture
}

let cache: GLCache | null = null
let disabled = false

function disposeCache(c: GLCache): void {
  const { gl, program, buf, texA, texB } = c
  gl.deleteTexture(texA)
  gl.deleteTexture(texB)
  gl.deleteBuffer(buf)
  gl.deleteProgram(program)
}

function getCache(): GLCache | null {
  if (typeof document === 'undefined') return null
  if (disabled) return null
  if (cache && cache.version !== SHADER_VERSION) {
    disposeCache(cache)
    cache = null
  }
  if (cache) return cache
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  }) as WebGLRenderingContext | null
  if (!gl) {
    disabled = true
    return null
  }
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) {
    disabled = true
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    return null
  }
  const program = gl.createProgram()
  if (!program) {
    disabled = true
    return null
  }
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    disabled = true
    gl.deleteProgram(program)
    return null
  }

  const buf = gl.createBuffer()
  if (!buf) {
    disabled = true
    return null
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)

  const texA = gl.createTexture()
  const texB = gl.createTexture()
  if (!texA || !texB) {
    disabled = true
    return null
  }

  cache = {
    version: SHADER_VERSION,
    canvas,
    gl,
    program,
    loc: {
      a_pos: gl.getAttribLocation(program, 'a_pos'),
      u_texA: gl.getUniformLocation(program, 'u_texA'),
      u_texB: gl.getUniformLocation(program, 'u_texB'),
      u_atlasA: gl.getUniformLocation(program, 'u_atlasA'),
      u_sizeA: gl.getUniformLocation(program, 'u_sizeA'),
      u_atlasB: gl.getUniformLocation(program, 'u_atlasB'),
      u_sizeB: gl.getUniformLocation(program, 'u_sizeB'),
      u_mix: gl.getUniformLocation(program, 'u_mix'),
      u_phase: gl.getUniformLocation(program, 'u_phase'),
      u_distortAmp: gl.getUniformLocation(program, 'u_distortAmp'),
      u_envelope: gl.getUniformLocation(program, 'u_envelope'),
      u_noiseMix: gl.getUniformLocation(program, 'u_noiseMix'),
      u_lumaBoost: gl.getUniformLocation(program, 'u_lumaBoost'),
    },
    buf,
    texA,
    texB,
  }
  return cache
}

function bindTexture(
  gl: WebGLRenderingContext,
  unit: number,
  tex: WebGLTexture,
  el: HTMLImageElement | HTMLVideoElement | ImageBitmap
): boolean {
  gl.activeTexture(unit)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el as TexImageSource)
  } catch {
    return false
  }
  return true
}

export function tryApplyMorphWebgl(params: TransformParams): boolean {
  const {
    ctx,
    progress,
    imgEl,
    x,
    y,
    w,
    h,
    sx,
    sy,
    sw,
    sh,
    animation,
    prevEl,
    prevParams,
    prevAnimation,
  } = params

  if (!prevEl || !prevParams || progress >= 1) return false
  if ((animation ?? 'none') !== 'none' || (prevAnimation ?? 'none') !== 'none') return false

  const dw = Math.max(1, Math.floor(w))
  const dh = Math.max(1, Math.floor(h))
  if (dw < 2 || dh < 2) return false

  const c = getCache()
  if (!c) return false

  const { gl, program, canvas, loc, buf, texA, texB } = c
  if (canvas.width !== dw || canvas.height !== dh) {
    canvas.width = dw
    canvas.height = dh
    gl.viewport(0, 0, dw, dh)
  }

  const { x: px, y: py, w: pw, h: ph, sx: psx, sy: psy, sw: psw, sh: psh } = prevParams
  const ease = progress * progress * (3 - 2 * progress)
  const bell = Math.sin(Math.PI * progress)
  const envelope = bell * 4 * ease * (1 - ease) * (1 - ease * 0.22)
  let distortAmp = 0.024 + envelope * 0.063

  const dimA = texDims(prevEl)
  const dimB = texDims(imgEl)
  if (dimA.w < 1 || dimA.h < 1 || dimB.w < 1 || dimB.h < 1) return false

  const simRaw = computeFrameSimilarity(
    prevEl,
    imgEl,
    { sx: psx, sy: psy, sw: psw, sh: psh },
    { sx, sy, sw, sh }
  )
  const sim = simRaw === null ? 0 : simRaw * simRaw * (3 - 2 * simRaw)
  const noiseMix = 1 - sim * 0.86
  const lumaBoost = 1 + sim * 0.38
  distortAmp *= 1 - sim * 0.44

  if (!bindTexture(gl, gl.TEXTURE0, texA, prevEl)) return false
  if (!bindTexture(gl, gl.TEXTURE1, texB, imgEl)) return false

  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.enableVertexAttribArray(loc.a_pos)
  gl.vertexAttribPointer(loc.a_pos, 2, gl.FLOAT, false, 0, 0)

  gl.uniform1i(loc.u_texA, 0)
  gl.uniform1i(loc.u_texB, 1)
  gl.uniform4f(loc.u_atlasA, psx, psy, psw, psh)
  gl.uniform2f(loc.u_sizeA, dimA.w, dimA.h)
  gl.uniform4f(loc.u_atlasB, sx, sy, sw, sh)
  gl.uniform2f(loc.u_sizeB, dimB.w, dimB.h)
  gl.uniform1f(loc.u_mix, ease)
  gl.uniform1f(loc.u_phase, progress * 8.2)
  gl.uniform1f(loc.u_distortAmp, distortAmp)
  gl.uniform1f(loc.u_envelope, Math.max(envelope, 0.0001))
  gl.uniform1f(loc.u_noiseMix, noiseMix)
  gl.uniform1f(loc.u_lumaBoost, lumaBoost)

  gl.disable(gl.BLEND)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  ctx.save()
  ctx.drawImage(canvas, x, y, w, h)
  ctx.restore()

  return true
}
