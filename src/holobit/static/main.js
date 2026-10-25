// The simulator, drawn with three.js on WebGL2.
//
// Shaders sum the light into float render targets: one for the slice
// (R, G = complex amplitude) and one for the screen plane. Each frame
// another shader turns the slice's phase and colors it. That image is the
// texture of the slice in a small 3D scene. The source, aperture and
// screen planes stand across the slice; in the flat view they are
// squeezed to nothing, and switching views swings the camera round while
// they grow out of their lines into planes.

import * as THREE from "three";
import { createControls } from "./controls.js";
import {
  BG,
  GLASS,
  MODE_LENS,
  ROW_LENS,
  ROW_OPEN,
  ROW_WALL,
  WALL,
  aperture,
  geometry,
  lensGroove,
  phaseStep,
  wavelengthColor,
} from "./optics.js";

// Seconds the switch between views takes.
const TRANSITION = 1.6;
const FOV = 30;
// Direction from the scene to the camera in the planes view: in front,
// off to the source side and a little above, as in the sketch.
const OBLIQUE_DIR = new THREE.Vector3(-0.62, 0.26, 0.74).normalize();
// World units per grid cell.
const UNIT = 1 / 100;

// The colors below are already screen colors; don't convert them.
THREE.ColorManagement.enabled = false;

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(window.devicePixelRatio);
if (!renderer.extensions.has("EXT_color_buffer_float")) {
  const msg = Object.assign(document.createElement("p"), {
    className: "error",
    textContent: "This browser doesn't support WebGL2 with float textures.",
  });
  canvas.replaceWith(msg);
  throw new Error("WebGL2 float render targets unavailable");
}

const controls = createControls(document.getElementById("controls"), {
  onChange: () => (dirty = true),
});
const params = controls.params;

let g = geometry(params);
const TOTAL_W = g.W + g.stripW;

// ---- Shaders -------------------------------------------------------------

const f1 = (v) => v.toFixed(1);
const vec3 = (c) => `vec3(${c.map((v) => (v / 255).toFixed(4)).join(", ")})`;

const HEAD = `
precision highp float;
precision highp int;
precision highp sampler2D;
`;

const QUAD_VERTEX = `${HEAD}
in vec3 position;
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// The light at a point: x along the axis, and p across it, where p.y is
// the height and p.x the distance out of the slice.
const OPTICS = `
uniform sampler2D uSources, uRows;
uniform float uK, uSrcX, uSrcH, uBarrierX, uBarrierHalf, uCenterY;
uniform int uMode, uCount;
// uPlane is 1 for a plane wave travelling in direction uDir (x along the
// axis, y up), 0 for the point source.
uniform int uPlane;
uniform vec2 uDir;
uniform float uApertureHalf;

const float TAU = 6.28318531;

// How strongly the beam lights a point q of the aperture plane, measured
// from its center. Same rule as beamProfile() in optics.js.
float beamProfile(vec2 q) {
  return exp(-3.0 * dot(q, q) / (uApertureHalf * uApertureHalf));
}

vec2 wave(float d) {
  float kr = mod(uK * d, TAU);
  return vec2(cos(kr), sin(kr));
}

vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// A wavelet seen from distance r, dx of it along the axis: fading with
// distance and weaker sideways (the obliquity factor).
vec2 wavelet(float r, float dx) {
  return 0.5 * (1.0 + dx / r) / r * wave(r);
}

// The light arriving from the source at a point. The point source's
// spherical wave has strength 1 where it meets the aperture on the axis;
// the plane wave has strength 1 everywhere and phase 0 there.
vec2 incident(float x, vec2 p) {
  if (uPlane == 1) return wave(uDir.x * (x - uBarrierX) + uDir.y * p.y);
  float d = length(vec3(x - uSrcX, p.x, p.y - uSrcH));
  return (uBarrierX - uSrcX) / max(d, 0.5) * wave(d);
}

vec2 fieldAt(float x, vec2 p) {
  bool inWall = abs(x - uBarrierX) <= uBarrierHalf;
  float kind = inWall ? texelFetch(uRows, ivec2(int(p.y + uCenterY), 0), 0).x : 0.0;
  if (x < uBarrierX - uBarrierHalf ||
      (inWall && (kind == ${f1(ROW_OPEN)} || kind == ${f1(ROW_LENS)}))) {
    return incident(x, p);
  }
  if (inWall) return vec2(0.0);

  float dx = x - uBarrierX;
  float s0 = uBarrierX - uSrcX;
  vec2 u = vec2(0.0);
  for (int i = 0; i < uCount; i++) {
    vec4 s = texelFetch(uSources, ivec2(i, 0), 0);
    if (uMode == ${MODE_LENS}) {
      // A ring of radius rho around a lens center at height s.w, averaged
      // over points around it. At angle phi a point sits rho * cos(phi)
      // out of the slice and rho * sin(phi) above the center. pc and hc
      // are the point and the source height measured from that center.
      float rho = s.x;
      vec2 pc = p - vec2(0.0, s.w);
      float hc = uSrcH - s.w;
      float toP2 = dx * dx + dot(pc, pc) + rho * rho;
      float toSrc2 = s0 * s0 + hc * hc + rho * rho;
      // The phase swings by about this much around the ring, so that many
      // points (plus a margin) is enough for an accurate average.
      float tilt = uPlane == 1 ? abs(uDir.y) : abs(hc) / sqrt(toSrc2);
      float swing = uK * rho * (length(pc) / sqrt(toP2) + tilt);
      int n = min(int(swing) + 8, 256);
      vec2 sum = vec2(0.0);
      for (int j = 0; j < n; j++) {
        float phi = (float(j) + 0.5) * TAU / float(n);
        vec2 q = rho * vec2(cos(phi), sin(phi));
        float r = sqrt(toP2 - 2.0 * dot(pc, q));
        vec2 plane = vec2(q.x, s.w + q.y);
        vec2 arriving = beamProfile(plane) * incident(uBarrierX, plane);
        sum += cmul(arriving, wavelet(r, dx));
      }
      u += cmul(s.yz, sum / float(n));
    } else {
      // A full-width slit row at height s.x, summed along its length.
      // That sum fades as 1/sqrt(r * (R + r)) for a point source R away,
      // and as 1/sqrt(r) for a plane wave.
      float y = p.y;
      float dy = y - s.x;
      float r = sqrt(dx * dx + dy * dy);
      float spread = uPlane == 1 ? sqrt(r) : sqrt(r / (s.w + r));
      u += spread * cmul(s.yz, wavelet(r, dx));
    }
  }
  return u;
}`;

const FIELD = `${HEAD}${OPTICS}
out vec4 outColor;
void main() {
  vec2 c = floor(gl_FragCoord.xy);
  outColor = vec4(fieldAt(c.x, vec2(0.0, c.y - uCenterY)), 0.0, 0.0);
}`;

// The screen plane, seen face on. Full-width slits give the same light
// all the way across, so only the height matters for them.
const SCREEN = `${HEAD}${OPTICS}
uniform float uScreenX;
out vec4 outColor;
void main() {
  vec2 p = floor(gl_FragCoord.xy) - uCenterY;
  vec2 f = fieldAt(uScreenX, uMode == ${MODE_LENS} ? p : vec2(0.0, p.y));
  outColor = vec4(f, dot(f, f), 0.0);
}`;

// Intensity normalized to the brightest point.
const SCREEN_COLOR = `${HEAD}
uniform sampler2D uScreen;
uniform vec3 uHue;
uniform float uMaxI;
out vec4 outColor;
void main() {
  float i = texelFetch(uScreen, ivec2(gl_FragCoord.xy), 0).b;
  outColor = vec4(uHue * clamp(i / uMaxI, 0.0, 1.0), 1.0);
}`;

// The slice is added on top of the scene, so black here means clear.
const SLICE_COLOR = `${HEAD}
uniform sampler2D uField, uRows, uScreen;
uniform vec2 uPhase;
uniform vec3 uHue;
uniform float uMaxI, uW, uR, uSrcX, uSrcH, uCenterY, uBarrierX, uBarrierHalf, uApertureHalf;
// How much of the screen strip shows: 1 in the cross section, fading to
// 0 in the full view, where the screen plane itself stands there.
uniform float uStrip;
uniform int uPlane;
uniform vec2 uDir;
out vec4 outColor;

// The light is a beam aimed at the aperture plane: before the plane, it
// shows only where it is headed for the plane. For the point source that
// is the wedge from the source to the plane's top and bottom edges; for
// the plane wave, the band of parallel rays that hit it. 1 inside, 0
// outside, with a soft edge. The sums only use light that reaches the
// plane, so this matches them.
float beam(vec2 c) {
  if (c.x >= uBarrierX - uBarrierHalf) return 1.0;
  float hit, scale;
  if (uPlane == 1) {
    // Where the ray through c meets the plane.
    hit = c.y + uDir.y / uDir.x * (uBarrierX - c.x);
    scale = 1.0;
  } else {
    // Where the ray from the source through c meets the plane, and how
    // much closer together rays are at c than at the plane.
    float toPlane = uBarrierX - uSrcX;
    float along = c.x - uSrcX;
    if (along <= 0.0) return 0.0;
    float srcY = uCenterY + uSrcH;
    hit = srcY + (c.y - srcY) * toPlane / along;
    scale = along / toPlane;
  }
  float inside = min(hit - (uCenterY - uApertureHalf), uCenterY + uApertureHalf - hit) * scale;
  float t = (hit - uCenterY) / uApertureHalf;
  return smoothstep(-1.5, 1.5, inside) * exp(-3.0 * t * t);
}

void main() {
  vec2 c = floor(gl_FragCoord.xy);
  vec3 rgb = vec3(0.0);
  if (c.x < uW) {
    vec4 row = texelFetch(uRows, ivec2(int(c.y), 0), 0);
    // Wall, lens glass, or an open row that partly blocks (the sine
    // grating), drawn as wall in proportion.
    bool partial = row.x == ${f1(ROW_OPEN)} && row.y > 0.01;
    bool drawn = row.x == ${f1(ROW_WALL)} || row.x == ${f1(ROW_LENS)} || partial;
    if (abs(c.x - uBarrierX) <= uBarrierHalf && drawn) {
      rgb = row.x == ${f1(ROW_WALL)} ? ${vec3(WALL)}
          : partial ? ${vec3(WALL)} * row.y
          : ${vec3(GLASS)} * (0.45 + 0.55 * row.y);
    } else if (uPlane == 0 && distance(c, vec2(uSrcX, uCenterY + uSrcH)) <= 3.0 * uR) {
      rgb = vec3(1.0);
    } else {
      // Each wave is a smooth cosine: brightest at the crest, dark in the
      // trough. How strong the light is sets the overall brightness, in
      // proportion, so weak light looks genuinely weak.
      vec2 f = texelFetch(uField, ivec2(c), 0).xy;
      float amp = length(f);
      float shade = 0.5 + 0.5 * dot(f, uPhase) / max(amp, 1e-6);
      float strength = min(amp, 1.0);
      rgb = uHue * shade * strength * beam(c);
    }
  } else if (c.x >= uW + 2.0 * uR) {
    // The screen strip: the center line of the screen plane.
    float i = texelFetch(uScreen, ivec2(int(uCenterY), int(c.y)), 0).b;
    rgb = uHue * clamp(i / uMaxI, 0.0, 1.0) * uStrip;
  }
  outColor = vec4(rgb, 1.0);
}`;

// ---- Render targets and passes --------------------------------------------

function floatTarget(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.FloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  });
}

function colorTarget(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
}

function dataTexture(data, width) {
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.needsUpdate = true;
  return tex;
}

const fieldRT = floatTarget(g.W, g.H);
const screenRT = floatTarget(g.H, g.H);
const sliceColorRT = colorTarget(TOTAL_W, g.H);
const screenColorRT = colorTarget(g.H, g.H);

const rowsData = new Float32Array(g.H * 4);
const rowsTex = dataTexture(rowsData, g.H);
let sourcesTex = null;

// Uniform objects are shared between materials, so one update reaches all.
const U = {
  uSources: { value: null },
  uRows: { value: rowsTex },
  uK: { value: g.k },
  uSrcX: { value: g.srcX },
  uSrcH: { value: g.srcH },
  uPlane: { value: 0 },
  uDir: { value: new THREE.Vector2(1, 0) },
  uBarrierX: { value: g.barrierX },
  uBarrierHalf: { value: g.barrierHalf },
  uCenterY: { value: g.centerY },
  uApertureHalf: { value: g.apertureSize / 2 },
  uMode: { value: 0 },
  uCount: { value: 0 },
  uScreen: { value: screenRT.texture },
  uHue: { value: new THREE.Vector3() },
  uMaxI: { value: 1e-9 },
};

function pass(fragmentShader, uniforms) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: QUAD_VERTEX,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
}

const fieldPass = pass(FIELD, U);
const screenPass = pass(SCREEN, { ...U, uScreenX: { value: g.screenX } });
const screenColorPass = pass(SCREEN_COLOR, U);
const uPhase = { value: new THREE.Vector2(1, 0) };
const uStrip = { value: 1 };
const sliceColorPass = pass(SLICE_COLOR, {
  ...U,
  uField: { value: fieldRT.texture },
  uPhase,
  uW: { value: g.W },
  uR: { value: g.r },
  uStrip,
});

const quadScene = new THREE.Scene();
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quad.frustumCulled = false;
quadScene.add(quad);

// Renders a full-screen pass into target, or only rows [row, row + rows)
// of it when given.
function runPass(material, target, row, rows) {
  quad.material = material;
  if (rows) {
    target.scissor.set(0, row, target.width, rows);
    target.scissorTest = true;
  }
  renderer.setRenderTarget(target);
  renderer.render(quadScene, quadCamera);
  renderer.setRenderTarget(null);
  target.scissorTest = false;
}

// ---- The 3D scene ---------------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(...BG.map((c) => c / 255));
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

// World x for a grid column; the slice is centered on the origin.
const toWorld = (x) => (x - TOTAL_W / 2) * UNIT;

const slice = new THREE.Mesh(
  new THREE.PlaneGeometry(TOTAL_W * UNIT, g.H * UNIT),
  new THREE.MeshBasicMaterial({
    map: sliceColorRT.texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
);
scene.add(slice);

function canvasTexture(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return new THREE.CanvasTexture(c);
}

// A square plane `size` grid cells across, standing across the axis at
// grid column x. Turned to face along the axis, its local x runs out of
// the slice, so scaling that squeezes it to a line.
function makePlane(x, texture, size) {
  const geo = new THREE.PlaneGeometry(size * UNIT, size * UNIT);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x8890a4, transparent: true, opacity: 0 }),
  );
  mesh.add(edges);
  mesh.position.x = toWorld(x);
  mesh.rotation.y = Math.PI / 2;
  scene.add(mesh);
  return { mesh, edges };
}

// The source and aperture planes are as big as the aperture; the screen
// is the full height of the slice.
const A = g.apertureSize;
const sourceTex = canvasTexture(A);

// Draws the source plane: faintly tinted, with a glow at the point source,
// or evenly lit for a plane wave, which comes from no single point.
function drawSource() {
  const ctx = sourceTex.image.getContext("2d");
  const mid = A / 2;
  // Canvas rows run top down, so raising the source moves it up the canvas.
  const y = mid - g.srcH;
  ctx.clearRect(0, 0, A, A);
  ctx.fillStyle = g.plane ? "rgba(255, 255, 255, 0.18)" : "rgba(150, 170, 220, 0.06)";
  ctx.fillRect(0, 0, A, A);
  if (!g.plane) {
    const glow = ctx.createRadialGradient(mid, y, 0, mid, y, A * 0.12);
    glow.addColorStop(0, "rgba(255, 255, 255, 1)");
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, A, A);
  }
  sourceTex.needsUpdate = true;
}

const apertureTex = canvasTexture(A);

// Draws the aperture plane face on: wall, and either full-width slits or
// round lenses shaded by their grooves (averaged where two overlap).
function drawAperture(ap) {
  const ctx = apertureTex.image.getContext("2d");
  const img = ctx.createImageData(A, A);
  for (let cy = 0; cy < A; cy++) {
    // Canvas rows run top down; slice rows bottom up.
    const row = g.centerY + A / 2 - 1 - cy;
    for (let cx = 0; cx < A; cx++) {
      let color = WALL;
      let alpha = 110;
      if (ap.lens) {
        let shade = 0;
        let covering = 0;
        for (const center of ap.lens.centers) {
          const rho = Math.hypot(cx - A / 2, row - g.centerY - center);
          if (rho > ap.lens.radius) continue;
          shade += 0.45 + 0.55 * lensGroove(g, rho);
          covering += 1;
        }
        if (covering > 0) {
          color = GLASS.map((c) => (c * shade) / covering);
          alpha = 120;
        }
      } else if (ap.kind[row] === ROW_OPEN) {
        alpha *= ap.groove[row];
      }
      img.data.set([...color, alpha], (cy * A + cx) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  apertureTex.needsUpdate = true;
}

const planes = [
  makePlane(g.srcX + 0.5, sourceTex, A),
  makePlane(g.barrierX + 0.5, apertureTex, A),
  makePlane(g.screenX, screenColorRT.texture, g.H),
];

// Places the camera and planes part way between the flat view (t = 0)
// and the planes view (t = 1).
function layout(t) {
  const e = t * t * (3 - 2 * t);
  const aspect = camera.aspect;
  const half = THREE.MathUtils.degToRad(FOV / 2);
  const halfW = (TOTAL_W * UNIT) / 2;
  const halfH = (g.H * UNIT) / 2;
  const flatDist = Math.max(halfH, halfW / aspect) / Math.tan(half);
  // In the flat view the slice is pinned to the top-left corner, so any
  // spare room collects at the bottom (where the controls float) or on
  // the right. Shifting the camera the other way moves the slice there.
  const viewHalfH = flatDist * Math.tan(half);
  const pin = new THREE.Vector3(
    Math.max(0, viewHalfH * aspect - halfW),
    -Math.max(0, viewHalfH - halfH),
    0,
  ).multiplyScalar(1 - e);
  // Fit the whole scene, planes included, inside the view.
  const fit = Math.min(half, Math.atan(aspect * Math.tan(half)));
  const obliqueDist = (0.8 * Math.hypot(halfW, halfH, halfH)) / Math.sin(fit);

  const dir = new THREE.Vector3(0, 0, 1).lerp(OBLIQUE_DIR, e).normalize();
  camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(flatDist, obliqueDist, e)));
  camera.position.add(pin);
  camera.lookAt(pin);

  uStrip.value = 1 - e;
  for (const { mesh, edges } of planes) {
    mesh.scale.x = Math.max(e, 1e-4);
    mesh.material.opacity = e;
    edges.material.opacity = 0.8 * e;
  }
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width === Math.round(w * renderer.getPixelRatio()) && camera.aspect === w / h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ---- Computing and drawing ------------------------------------------------

const readBack = new Float32Array(g.H * g.H * 4);
let dirty = true;

// Wavelet sums to do per drawn frame. The light is computed a band of
// rows at a time, so a heavy case (the lenses) never freezes the page or
// trips the GPU's watchdog; the previous picture stays up meanwhile.
const SUMS_PER_FRAME = 2e8;
// The calculation in progress, or null when the light is up to date.
let job = null;

// Starts recomputing the light for the current settings.
function startCompute() {
  g = geometry(params);
  const ap = aperture(params, g);
  for (let y = 0; y < g.H; y++) rowsData.set([ap.kind[y], ap.groove[y], 0, 0], y * 4);
  rowsTex.needsUpdate = true;
  sourcesTex?.dispose();
  sourcesTex = dataTexture(ap.sources, ap.sources.length / 4);

  U.uSources.value = sourcesTex;
  U.uK.value = g.k;
  U.uSrcH.value = g.srcH;
  U.uPlane.value = g.plane ? 1 : 0;
  U.uDir.value.set(g.dirX, g.dirY);
  U.uMode.value = ap.mode;
  U.uCount.value = ap.count;
  U.uHue.value.set(...wavelengthColor(params.wavelength).map((c) => c / 255));
  drawAperture(ap);
  drawSource();

  // Rough sums per pixel: one per slit row, or for the lenses one per
  // point averaged around each ring (see the shader).
  const perPixel = ap.lens ? ap.count * (8 + 0.4 * g.k * ap.lens.radius) : ap.count;
  job = { fieldRow: 0, screenRow: 0, perPixel };
}

// Does one frame's share of the calculation, finishing it if it can.
function continueCompute() {
  let budget = SUMS_PER_FRAME;
  const band = (material, target, done) => {
    const width = target.width;
    const rows = Math.min(
      target.height - done,
      Math.max(1, Math.floor(budget / (width * job.perPixel))),
    );
    runPass(material, target, done, rows);
    budget -= rows * width * job.perPixel;
    return done + rows;
  };
  while (budget > 0 && job.fieldRow < g.H) job.fieldRow = band(fieldPass, fieldRT, job.fieldRow);
  while (budget > 0 && job.screenRow < g.H) job.screenRow = band(screenPass, screenRT, job.screenRow);
  if (job.screenRow < g.H) return;

  // Read the screen back once to normalize it to its brightest point.
  renderer.readRenderTargetPixels(screenRT, 0, 0, g.H, g.H, readBack);
  let maxI = 1e-9;
  for (let i = 2; i < readBack.length; i += 4) maxI = Math.max(maxI, readBack[i]);
  U.uMaxI.value = maxI;
  runPass(screenColorPass, screenColorRT);
  job = null;
}

let viewT = 0;
let phase = 0;
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (dirty) {
    dirty = false;
    startCompute();
  }
  if (job) continueCompute();

  const target = params.view === "planes" ? 1 : 0;
  const step = dt / TRANSITION;
  viewT = target > viewT ? Math.min(target, viewT + step) : Math.max(target, viewT - step);

  phase += phaseStep(g);
  uPhase.value.set(Math.cos(phase), Math.sin(phase));
  resize();
  layout(viewT);
  runPass(sliceColorPass, sliceColorRT);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
