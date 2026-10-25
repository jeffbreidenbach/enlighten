// Steady-state optics on the GPU. A shader sums the complex field into a
// float texture (R = real part, G = imaginary part) a band of rows per
// frame; a second shader turns the phase and colors it every frame. The
// wall is uploaded as a one-row texture: per row its kind, the wavelet's
// real and imaginary strength, and the lens groove position.

import {
  BG,
  GAIN,
  GLASS,
  ROW_OPEN,
  ROW_WALL,
  WALL,
  aperture,
  createControls,
  geometry,
  phaseStep,
  wavelengthColor,
} from "./common.js";

const canvas = document.getElementById("view");
const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
if (!gl || !gl.getExtension("EXT_color_buffer_float")) {
  const msg = Object.assign(document.createElement("p"), {
    className: "error",
    textContent: "This browser doesn't support WebGL2 with float textures.",
  });
  canvas.replaceWith(msg);
  throw new Error("WebGL2 float render targets unavailable");
}

// Pixel-wavelet sums per frame. Splitting the work keeps each draw call
// short, so a big grid doesn't freeze the page or trip the GPU watchdog.
const SUMS_PER_FRAME = 5e7;

const vec3 = (c) => `vec3(${c.map((v) => (v / 255).toFixed(4)).join(", ")})`;

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// Same sums as computeRow() in canvas2d.js.
const FIELD = `#version 300 es
precision highp float;
uniform highp sampler2D uRows;
uniform vec2 uSize, uSrc;
uniform float uK, uBarrierX, uBarrierHalf;
out vec4 outField;

const float TAU = 6.28318531;

vec2 wave(float d) {
  float kr = mod(uK * d, TAU);
  return vec2(cos(kr), sin(kr));
}

void main() {
  vec2 c = floor(gl_FragCoord.xy);
  vec2 u = vec2(0.0);
  if (c.x > uBarrierX + uBarrierHalf) {
    float dx = c.x - uBarrierX;
    int rows = int(uSize.y);
    for (int ya = 0; ya < rows; ya++) {
      vec4 row = texelFetch(uRows, ivec2(ya, 0), 0);
      if (row.x == ${ROW_WALL.toFixed(1)}) continue;
      float dy = c.y - float(ya);
      float d = sqrt(dx * dx + dy * dy);
      float w = 0.5 * (1.0 + dx / d) / sqrt(d);
      vec2 e = wave(d);
      u += w * vec2(row.y * e.x - row.z * e.y, row.y * e.y + row.z * e.x);
    }
  } else if (c.x < uBarrierX - uBarrierHalf ||
             texelFetch(uRows, ivec2(int(c.y), 0), 0).x != ${ROW_WALL.toFixed(1)}) {
    float d = max(distance(c, uSrc), 0.5);
    u = sqrt((uBarrierX - uSrc.x) / d) * wave(d);
  }
  outField = vec4(u, 0.0, 0.0);
}`;

const DRAW = `#version 300 es
precision highp float;
uniform highp sampler2D uField, uRows;
uniform vec2 uSize, uSrc, uPhase;
uniform vec3 uHue;
uniform float uR, uBarrierX, uBarrierHalf, uMaxI, uScreenX;
out vec4 color;

void main() {
  vec2 c = floor(gl_FragCoord.xy);
  vec3 bg = ${vec3(BG)};
  vec3 rgb;
  if (c.x < uSize.x) {
    vec4 row = texelFetch(uRows, ivec2(int(c.y), 0), 0);
    if (abs(c.x - uBarrierX) <= uBarrierHalf && row.x != ${ROW_OPEN.toFixed(1)}) {
      rgb = row.x == ${ROW_WALL.toFixed(1)}
        ? ${vec3(WALL)}
        : mix(bg, ${vec3(GLASS)}, 0.45 + 0.55 * row.w);
    } else if (distance(c, uSrc) <= 3.0 * uR) {
      rgb = vec3(1.0);
    } else {
      // Crests light up in the wavelength's color; troughs stay dark.
      vec2 f = texelFetch(uField, ivec2(c), 0).xy;
      float v = tanh(clamp(${GAIN.toFixed(1)} * dot(f, uPhase), -10.0, 10.0));
      rgb = mix(bg, uHue, max(v, 0.0));
    }
  } else if (c.x < uSize.x + 2.0 * uR) {
    rgb = bg * 0.5;
  } else {
    vec2 f = texelFetch(uField, ivec2(int(uScreenX), int(c.y)), 0).xy;
    rgb = mix(bg, uHue, pow(clamp(dot(f, f) / uMaxI, 0.0, 1.0), 0.8));
  }
  color = vec4(rgb, 1.0);
}`;

function program(fragment) {
  const prog = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, fragment],
  ]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const uniforms = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let k = 0; k < count; k++) {
    const name = gl.getActiveUniform(prog, k).name;
    uniforms[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, uniforms };
}

function floatTexture(w, h, data) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

const fieldProg = program(FIELD);
const drawProg = program(DRAW);
gl.bindVertexArray(gl.createVertexArray());

const controls = createControls(document.getElementById("controls"), { onChange: restart });
const params = controls.params;

let g, rowsTex, fieldTex, fieldFbo, nextRow, bandRows, started, readBack;
let maxI = 1e-9;
let phase = 0;

function restart() {
  const resized = !g || g.r !== params.resolution;
  g = geometry(params);
  if (resized) {
    canvas.width = g.W + g.stripW;
    canvas.height = g.H;
    if (fieldTex) gl.deleteTexture(fieldTex);
    if (fieldFbo) gl.deleteFramebuffer(fieldFbo);
    fieldTex = floatTexture(g.W, g.H, null);
    fieldFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fieldFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fieldTex, 0);
    readBack = new Float32Array(g.H * 4);
  }

  const ap = aperture(params, g);
  const rows = new Float32Array(g.H * 4);
  for (let y = 0; y < g.H; y++) rows.set([ap.kind[y], ap.re[y], ap.im[y], ap.groove[y]], y * 4);
  if (rowsTex) gl.deleteTexture(rowsTex);
  rowsTex = floatTexture(g.H, 1, rows);

  bandRows = Math.max(1, Math.floor(SUMS_PER_FRAME / (g.W * g.H)));
  nextRow = 0;
  started = performance.now();
}

function computeBand() {
  const u = fieldProg.uniforms;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fieldFbo);
  gl.viewport(0, 0, g.W, g.H);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(0, nextRow, g.W, bandRows);
  gl.useProgram(fieldProg.prog);
  gl.uniform2f(u.uSize, g.W, g.H);
  gl.uniform2f(u.uSrc, g.srcX, g.srcY);
  gl.uniform1f(u.uK, g.k);
  gl.uniform1f(u.uBarrierX, g.barrierX);
  gl.uniform1f(u.uBarrierHalf, g.barrierHalf);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, rowsTex);
  gl.uniform1i(u.uRows, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.disable(gl.SCISSOR_TEST);
  nextRow = Math.min(g.H, nextRow + bandRows);

  if (nextRow === g.H) {
    // Read the screen column back once to normalize the strip. This
    // waits for the GPU, which also makes the timing below honest.
    gl.readPixels(g.screenX, 0, 1, g.H, gl.RGBA, gl.FLOAT, readBack);
    maxI = 1e-9;
    for (let y = 0; y < g.H; y++) {
      maxI = Math.max(maxI, readBack[y * 4] ** 2 + readBack[y * 4 + 1] ** 2);
    }
    controls.computed(performance.now() - started);
  }
}

function draw() {
  const u = drawProg.uniforms;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(drawProg.prog);
  gl.uniform2f(u.uSize, g.W, g.H);
  gl.uniform2f(u.uSrc, g.srcX, g.srcY);
  gl.uniform2f(u.uPhase, Math.cos(phase), Math.sin(phase));
  gl.uniform3fv(u.uHue, wavelengthColor(params.wavelength).map((c) => c / 255));
  gl.uniform1f(u.uR, g.r);
  gl.uniform1f(u.uBarrierX, g.barrierX);
  gl.uniform1f(u.uBarrierHalf, g.barrierHalf);
  gl.uniform1f(u.uMaxI, maxI);
  gl.uniform1f(u.uScreenX, g.screenX);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fieldTex);
  gl.uniform1i(u.uField, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, rowsTex);
  gl.uniform1i(u.uRows, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function frame() {
  if (nextRow < g.H) computeBand();
  if (!controls.paused) phase += phaseStep(g);
  draw();
  controls.frame();
  requestAnimationFrame(frame);
}

restart();
requestAnimationFrame(frame);
