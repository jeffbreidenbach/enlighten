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
  GAIN,
  GLASS,
  MODE_LENS,
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

const float TAU = 6.28318531;

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

// The source's spherical wave, strength 1 where it meets the aperture on
// the axis. d is the distance from the source.
vec2 incident(float d) {
  return (uBarrierX - uSrcX) / max(d, 0.5) * wave(d);
}

vec2 fieldAt(float x, vec2 p) {
  bool inWall = abs(x - uBarrierX) <= uBarrierHalf;
  if (x < uBarrierX - uBarrierHalf ||
      (inWall && texelFetch(uRows, ivec2(int(p.y + uCenterY), 0), 0).x != ${f1(ROW_WALL)})) {
    return incident(length(vec3(x - uSrcX, p.x, p.y - uSrcH)));
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
      float swing = uK * rho * (length(pc) / sqrt(toP2) + abs(hc) / sqrt(toSrc2));
      int n = min(int(swing) + 8, 256);
      vec2 sum = vec2(0.0);
      for (int j = 0; j < n; j++) {
        float phi = (float(j) + 0.5) * TAU / float(n);
        vec2 q = rho * vec2(cos(phi), sin(phi));
        float r = sqrt(toP2 - 2.0 * dot(pc, q));
        float fromSrc = sqrt(toSrc2 - 2.0 * hc * q.y);
        sum += cmul(incident(fromSrc), wavelet(r, dx));
      }
      u += cmul(s.yz, sum / float(n));
    } else {
      // A full-width slit row at height s.x, summed along its length.
      float y = p.y;
      float dy = y - s.x;
      float r = sqrt(dx * dx + dy * dy);
      u += sqrt(r / (s.w + r)) * cmul(s.yz, wavelet(r, dx));
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
  outColor = vec4(uHue * pow(clamp(i / uMaxI, 0.0, 1.0), 0.8), 1.0);
}`;

// The slice is added on top of the scene, so black here means clear.
const SLICE_COLOR = `${HEAD}
uniform sampler2D uField, uRows, uScreen;
uniform vec2 uPhase;
uniform vec3 uHue;
uniform float uMaxI, uW, uR, uSrcX, uSrcH, uCenterY, uBarrierX, uBarrierHalf;
out vec4 outColor;

// The source shines like a flashlight aimed at the aperture plane: before
// the plane, light shows only inside the wedge from the source to the
// plane's top and bottom edges. 1 inside, 0 outside, with a soft edge.
// Only the drawing changes; the plane is fully lit either way.
float beam(vec2 c) {
  float toPlane = uBarrierX - uSrcX;
  float along = c.x - uSrcX;
  if (c.x >= uBarrierX - uBarrierHalf) return 1.0;
  if (along <= 0.0) return 0.0;
  // Where the ray from the source through c meets the plane, and how far
  // inside the plane's edges that is, scaled back to c's distance.
  float srcY = uCenterY + uSrcH;
  float hit = srcY + (c.y - srcY) * toPlane / along;
  float inside = min(hit, 2.0 * uCenterY - hit) * along / toPlane;
  return smoothstep(-1.5, 1.5, inside);
}

void main() {
  vec2 c = floor(gl_FragCoord.xy);
  vec3 rgb = vec3(0.0);
  if (c.x < uW) {
    vec4 row = texelFetch(uRows, ivec2(int(c.y), 0), 0);
    if (abs(c.x - uBarrierX) <= uBarrierHalf && row.x != ${f1(ROW_OPEN)}) {
      rgb = row.x == ${f1(ROW_WALL)} ? ${vec3(WALL)} : ${vec3(GLASS)} * (0.45 + 0.55 * row.y);
    } else if (distance(c, vec2(uSrcX, uCenterY + uSrcH)) <= 3.0 * uR) {
      rgb = vec3(1.0);
    } else {
      // Crests light up in the wavelength's color; troughs stay dark.
      vec2 f = texelFetch(uField, ivec2(c), 0).xy;
      float v = tanh(clamp(${GAIN.toFixed(1)} * dot(f, uPhase), -10.0, 10.0));
      rgb = uHue * max(v, 0.0) * beam(c);
    }
  } else if (c.x >= uW + 2.0 * uR) {
    // The screen strip: the center line of the screen plane.
    float i = texelFetch(uScreen, ivec2(int(uCenterY), int(c.y)), 0).b;
    rgb = uHue * pow(clamp(i / uMaxI, 0.0, 1.0), 0.8);
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
  uBarrierX: { value: g.barrierX },
  uBarrierHalf: { value: g.barrierHalf },
  uCenterY: { value: g.centerY },
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
const sliceColorPass = pass(SLICE_COLOR, {
  ...U,
  uField: { value: fieldRT.texture },
  uPhase,
  uW: { value: g.W },
  uR: { value: g.r },
});

const quadScene = new THREE.Scene();
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quad.frustumCulled = false;
quadScene.add(quad);

function runPass(material, target) {
  quad.material = material;
  renderer.setRenderTarget(target);
  renderer.render(quadScene, quadCamera);
  renderer.setRenderTarget(null);
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

// A square plane across the axis at grid column x. Turned to face along
// the axis, its local x runs out of the slice, so scaling that squeezes
// it to a line.
function makePlane(x, texture) {
  const size = g.H * UNIT;
  const geo = new THREE.PlaneGeometry(size, size);
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

const sourceTex = canvasTexture(g.H);

// Draws the source plane: faintly tinted, with a glow at the source.
function drawSource() {
  const ctx = sourceTex.image.getContext("2d");
  const mid = g.H / 2;
  // Canvas rows run top down, so raising the source moves it up the canvas.
  const y = mid - g.srcH;
  ctx.clearRect(0, 0, g.H, g.H);
  ctx.fillStyle = "rgba(150, 170, 220, 0.06)";
  ctx.fillRect(0, 0, g.H, g.H);
  const glow = ctx.createRadialGradient(mid, y, 0, mid, y, g.H * 0.08);
  glow.addColorStop(0, "rgba(255, 255, 255, 1)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, g.H, g.H);
  sourceTex.needsUpdate = true;
}

const apertureTex = canvasTexture(g.H);

// Draws the aperture plane face on: wall, and either full-width slits or
// round lenses shaded by their grooves (averaged where two overlap).
function drawAperture(ap) {
  const ctx = apertureTex.image.getContext("2d");
  const img = ctx.createImageData(g.H, g.H);
  for (let cy = 0; cy < g.H; cy++) {
    // Canvas rows run top down; slice rows bottom up.
    const row = g.H - 1 - cy;
    for (let cx = 0; cx < g.H; cx++) {
      let color = WALL;
      let alpha = 110;
      if (ap.mode === MODE_LENS) {
        let shade = 0;
        let covering = 0;
        for (const center of ap.lensCenters) {
          const rho = Math.hypot(cx - g.centerY, row - g.centerY - center);
          if (rho > g.lensRadius) continue;
          shade += 0.45 + 0.55 * lensGroove(g, rho);
          covering += 1;
        }
        if (covering > 0) {
          color = GLASS.map((c) => (c * shade) / covering);
          alpha = 120;
        }
      } else if (ap.kind[row] !== ROW_WALL) {
        alpha = 0;
      }
      img.data.set([...color, alpha], (cy * g.H + cx) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  apertureTex.needsUpdate = true;
}

const planes = [
  makePlane(g.srcX + 0.5, sourceTex),
  makePlane(g.barrierX + 0.5, apertureTex),
  makePlane(g.screenX, screenColorRT.texture),
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
  // Fit the whole scene, planes included, inside the view.
  const fit = Math.min(half, Math.atan(aspect * Math.tan(half)));
  const obliqueDist = (0.8 * Math.hypot(halfW, halfH, halfH)) / Math.sin(fit);

  const dir = new THREE.Vector3(0, 0, 1).lerp(OBLIQUE_DIR, e).normalize();
  camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(flatDist, obliqueDist, e)));
  camera.lookAt(0, 0, 0);

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

function compute() {
  const t0 = performance.now();
  g = geometry(params);
  const ap = aperture(params, g);
  for (let y = 0; y < g.H; y++) rowsData.set([ap.kind[y], ap.groove[y], 0, 0], y * 4);
  rowsTex.needsUpdate = true;
  sourcesTex?.dispose();
  sourcesTex = dataTexture(ap.sources, ap.sources.length / 4);

  U.uSources.value = sourcesTex;
  U.uK.value = g.k;
  U.uSrcH.value = g.srcH;
  U.uMode.value = ap.mode;
  U.uCount.value = ap.count;
  U.uHue.value.set(...wavelengthColor(params.wavelength).map((c) => c / 255));

  runPass(fieldPass, fieldRT);
  runPass(screenPass, screenRT);
  // Reading back waits for the GPU, which also makes the timing honest.
  renderer.readRenderTargetPixels(screenRT, 0, 0, g.H, g.H, readBack);
  let maxI = 1e-9;
  for (let i = 2; i < readBack.length; i += 4) maxI = Math.max(maxI, readBack[i]);
  U.uMaxI.value = maxI;
  runPass(screenColorPass, screenColorRT);
  drawAperture(ap);
  drawSource();
  controls.computed(performance.now() - t0);
}

let viewT = 0;
let phase = 0;
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (dirty) {
    dirty = false;
    compute();
  }

  const target = params.view === "planes" ? 1 : 0;
  const step = dt / TRANSITION;
  viewT = target > viewT ? Math.min(target, viewT + step) : Math.max(target, viewT - step);

  if (!controls.paused) phase += phaseStep(g);
  uPhase.value.set(Math.cos(phase), Math.sin(phase));
  runPass(sliceColorPass, sliceColorRT);

  resize();
  layout(viewT);
  renderer.render(scene, camera);
  controls.frame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
