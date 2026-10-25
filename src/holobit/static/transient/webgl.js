// Double slit on the GPU. The grid lives in a float texture: R holds the
// current wave value, G the previous one and B the running average of
// the intensity. Each step reads one texture and writes the other.

import {
  AVG,
  BG,
  C2,
  GAIN,
  RESET_KEYS,
  WALL,
  advanceSource,
  createControls,
  geometry,
  makeSource,
  stepsPerFrame,
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

const vec3 = (c) => `vec3(${c.map((v) => (v / 255).toFixed(4)).join(", ")})`;

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// Same wall and sponge rules as common.js.
const SCENE = `
uniform vec2 uSize;
uniform float uSponge, uWallSponge, uBarrierX, uBarrierHalf, uCenterY, uSlitHalfSep, uSlitHalfWidth;

bool inSlit(vec2 c) {
  return abs(abs(c.y - uCenterY) - uSlitHalfSep) <= uSlitHalfWidth;
}

bool isWall(vec2 c) {
  return abs(c.x - uBarrierX) <= uBarrierHalf && !inSlit(c);
}

float spongeAt(vec2 c) {
  float d = min(min(c.x, c.y), min(uSize.x - 1.0 - c.x, uSize.y - 1.0 - c.y));
  float k = max(uSponge - d, 0.0) / uSponge;
  float front = uBarrierX - uBarrierHalf - c.x;
  if (front >= 0.0 && front < uWallSponge && !inSlit(c)) {
    k = max(k, 1.0 - front / uWallSponge);
  }
  return 0.25 * k * k;
}`;

const STEP = `#version 300 es
precision highp float;
uniform highp sampler2D uState;
uniform vec2 uSrc;
uniform float uSrcRadius, uSrcValue, uScreenKeep;
out vec4 outState;
${SCENE}

void main() {
  ivec2 ic = ivec2(gl_FragCoord.xy);
  vec2 c = vec2(ic);
  vec4 s = texelFetch(uState, ic, 0);
  float u = s.r;
  float next;
  if (c.x == 0.0 || c.y == 0.0 || c.x == uSize.x - 1.0 || c.y == uSize.y - 1.0 || isWall(c)) {
    next = 0.0;
  } else if (distance(c, uSrc) <= uSrcRadius) {
    next = uSrcValue;
  } else {
    float lap = texelFetch(uState, ic + ivec2(1, 0), 0).r +
                texelFetch(uState, ic - ivec2(1, 0), 0).r +
                texelFetch(uState, ic + ivec2(0, 1), 0).r +
                texelFetch(uState, ic - ivec2(0, 1), 0).r - 4.0 * u;
    float sg = spongeAt(c);
    next = (2.0 * u - (1.0 - sg) * s.g + ${C2.toFixed(4)} * lap) / (1.0 + sg);
  }
  float avg = s.b * uScreenKeep;
  outState = vec4(next, u, avg + (next * next - avg) * ${AVG.toFixed(4)}, 0.0);
}`;

const DRAW = `#version 300 es
precision highp float;
uniform highp sampler2D uState;
uniform vec2 uSrc;
uniform vec3 uHue;
uniform float uR, uMaxI, uScreenX;
out vec4 color;
${SCENE}

void main() {
  vec2 c = floor(gl_FragCoord.xy);
  vec3 bg = ${vec3(BG)};
  vec3 rgb;
  if (c.x < uSize.x) {
    if (isWall(c)) {
      rgb = ${vec3(WALL)};
    } else if (distance(c, uSrc) <= 3.0 * uR) {
      rgb = vec3(1.0);
    } else {
      // Crests light up in the wavelength's color; troughs stay dark.
      float v = tanh(${GAIN.toFixed(1)} * texelFetch(uState, ivec2(c), 0).r);
      rgb = mix(bg, uHue, max(v, 0.0));
    }
  } else if (c.x < uSize.x + 2.0 * uR) {
    rgb = bg * 0.5;
  } else {
    float i = texelFetch(uState, ivec2(int(uScreenX), int(c.y)), 0).b;
    rgb = mix(bg, uHue, pow(clamp(i / uMaxI, 0.0, 1.0), 0.8));
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

const stepProg = program(STEP);
const drawProg = program(DRAW);
gl.bindVertexArray(gl.createVertexArray());

const controls = createControls(document.getElementById("controls"), { onChange });
const params = controls.params;

let g, source, textures, fbos, cur, readBack, maxI, frameCount;
let clearScreen = false;

function reset() {
  g = geometry(params);
  canvas.width = g.W + g.stripW;
  canvas.height = g.H;

  for (const t of textures ?? []) gl.deleteTexture(t);
  for (const f of fbos ?? []) gl.deleteFramebuffer(f);
  textures = [];
  fbos = [];
  for (let k = 0; k < 2; k++) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, g.W, g.H, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    textures.push(tex);
    fbos.push(fbo);
  }
  cur = 0;
  readBack = new Float32Array(g.H * 4);
  maxI = 1e-9;
  frameCount = 0;
  source = makeSource();
}

function onChange(key) {
  if (RESET_KEYS.has(key)) reset();
  else if (key === "wavelength") clearScreen = true;
}

function setScene(uniforms) {
  gl.uniform2f(uniforms.uSize, g.W, g.H);
  gl.uniform1f(uniforms.uSponge, g.sponge);
  gl.uniform1f(uniforms.uWallSponge, g.wallSponge);
  gl.uniform1f(uniforms.uBarrierX, g.barrierX);
  gl.uniform1f(uniforms.uBarrierHalf, g.barrierHalf);
  gl.uniform1f(uniforms.uCenterY, g.centerY);
  gl.uniform1f(uniforms.uSlitHalfSep, g.slitHalfSep);
  gl.uniform1f(uniforms.uSlitHalfWidth, g.slitHalfWidth);
  gl.uniform2f(uniforms.uSrc, g.srcX, g.srcY);
}

function simulate(steps) {
  const u = stepProg.uniforms;
  gl.useProgram(stepProg.prog);
  gl.viewport(0, 0, g.W, g.H);
  setScene(u);
  gl.uniform1f(u.uSrcRadius, g.srcRadius);
  gl.uniform1i(u.uState, 0);
  gl.activeTexture(gl.TEXTURE0);
  for (let k = 0; k < steps; k++) {
    gl.uniform1f(u.uSrcValue, advanceSource(source, params, g));
    gl.uniform1f(u.uScreenKeep, clearScreen ? 0 : 1);
    clearScreen = false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[1 - cur]);
    gl.bindTexture(gl.TEXTURE_2D, textures[cur]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    cur = 1 - cur;
  }
}

// The screen strip is normalized to its brightest point. Reading that
// column back from the GPU is a small sync, so do it every few frames.
function updateMax() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[cur]);
  gl.readPixels(g.screenX, 0, 1, g.H, gl.RGBA, gl.FLOAT, readBack);
  maxI = 1e-9;
  for (let y = 0; y < g.H; y++) maxI = Math.max(maxI, readBack[y * 4 + 2]);
}

function draw() {
  const u = drawProg.uniforms;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(drawProg.prog);
  setScene(u);
  gl.uniform1f(u.uR, g.r);
  gl.uniform3fv(u.uHue, wavelengthColor(params.wavelength).map((c) => c / 255));
  gl.uniform1f(u.uMaxI, maxI);
  gl.uniform1f(u.uScreenX, g.screenX);
  gl.uniform1i(u.uState, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures[cur]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function frame() {
  const steps = controls.paused ? 0 : stepsPerFrame(g);
  simulate(steps);
  if (frameCount++ % 6 === 0) updateMax();
  draw();
  controls.frame(steps * g.W * g.H);
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
