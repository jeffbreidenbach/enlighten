// Wires the simulator together, drawn with three.js on WebGL2.
//
// - physics/: the core calculation. aperture.js turns the chosen aperture
//   into wavelets; wavefield.js adds them up at every point on the GPU.
// - view/: how the light is drawn, and the 3D scene.
// - ui/: the controls, their explanations and the tour.
//
// When a setting changes, the light is recomputed into float textures,
// a band of rows per frame. Every frame the cross section is colored at
// the current phase, so the waves move, and the scene is drawn.

import * as THREE from "three";
import { FULLSCREEN_VERTEX } from "./glsl.js";
import { aperture } from "./physics/aperture.js";
import { geometry } from "./physics/layout.js";
import { FIELD_SHADER, SCREEN_SHADER } from "./physics/wavefield.js";
import { createControls } from "./ui/controls.js";
import {
  phaseStep,
  SCREEN_COLOR_SHADER,
  SLICE_COLOR_SHADER,
  wavelengthColor,
} from "./view/display.js";
import { createScene } from "./view/scene.js";

// Seconds the switch between views takes.
const TRANSITION = 1.6;
// Wavelet sums to do per drawn frame. A heavy case (the lenses) is spread
// over several frames, so it never freezes the page or trips the GPU's
// watchdog; the previous picture stays up meanwhile.
const SUMS_PER_FRAME = 2e8;

// The colors are already screen colors; don't convert them.
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

let dirty = true;
const { params } = createControls(document.getElementById("controls"), {
  onChange: () => (dirty = true),
});
// The layout's sizes don't change with the settings, so the targets and
// scene are built once from the first geometry.
let g = geometry(params);

// ---- Textures --------------------------------------------------------------

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

// A row of RGBA floats as a texture, for the shaders to look up.
function dataTexture(data) {
  const tex = new THREE.DataTexture(data, data.length / 4, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.needsUpdate = true;
  return tex;
}

// The computed light: the cross section, and the screen face on.
const fieldRT = floatTarget(g.W, g.H);
const screenRT = floatTarget(g.H, g.H);
// What is drawn from it.
const sliceColorRT = colorTarget(g.W + g.stripW, g.H);
const screenColorRT = colorTarget(g.H, g.H);

// Per row of the aperture line: [kind, block, groove, 0].
const rowsData = new Float32Array(g.H * 4);
const rowsTex = dataTexture(rowsData);

// ---- Shader passes ----------------------------------------------------------

// Uniforms shared by every pass, so one update reaches all of them.
const U = {
  uK: { value: 0 },
  uPlaneWave: { value: 0 },
  uBeamDir: { value: new THREE.Vector2() },
  uSourceX: { value: g.sourceX },
  uSourceY: { value: 0 },
  uApertureX: { value: g.apertureX },
  uWallHalf: { value: g.wallHalf },
  uApertureHalf: { value: g.apertureSize / 2 },
  uCenterY: { value: g.centerY },
  uRows: { value: rowsTex },
  uWavelets: { value: null },
  uWaveletCount: { value: 0 },
  uMode: { value: 0 },
  uScreen: { value: screenRT.texture },
  uHue: { value: new THREE.Vector3() },
  uMaxIntensity: { value: 1e-9 },
};
const uPhase = { value: new THREE.Vector2(1, 0) };
const uStrip = { value: 1 };

function pass(fragmentShader, uniforms) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
}

const fieldPass = pass(FIELD_SHADER, U);
const screenPass = pass(SCREEN_SHADER, { ...U, uScreenX: { value: g.screenX } });
const screenColorPass = pass(SCREEN_COLOR_SHADER, U);
const sliceColorPass = pass(SLICE_COLOR_SHADER, {
  ...U,
  uField: { value: fieldRT.texture },
  uPhase,
  uStrip,
  uWidth: { value: g.W },
  uScale: { value: g.scale },
});

const quadScene = new THREE.Scene();
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quad.frustumCulled = false;
quadScene.add(quad);

// Runs a shader over all of target, or only rows [row, row + rows) of it.
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

// ---- Computing the light ----------------------------------------------------

const { scene, camera, layout, drawAperture } = createScene(g, sliceColorRT.texture, screenColorRT.texture);
const readBack = new Float32Array(g.H * g.H * 4);
// The calculation in progress, or null when the light is up to date.
let job = null;

// Starts recomputing the light for the current settings.
function startCompute() {
  g = geometry(params);
  const ap = aperture(params, g);
  for (let row = 0; row < g.H; row++) {
    rowsData.set([ap.kind[row], ap.block[row], ap.groove[row], 0], row * 4);
  }
  rowsTex.needsUpdate = true;
  U.uWavelets.value?.dispose();
  U.uWavelets.value = dataTexture(ap.wavelets);
  U.uWaveletCount.value = ap.count;
  U.uMode.value = ap.mode;
  U.uK.value = g.k;
  U.uPlaneWave.value = g.planeWave ? 1 : 0;
  U.uBeamDir.value.set(...g.beamDir);
  U.uSourceY.value = g.sourceY;
  U.uHue.value.set(...wavelengthColor(params.wavelength).map((c) => c / 255));
  drawAperture(ap, g);

  // Roughly how many wavelet sums each pixel needs: one per slit row, or
  // for the lenses one per point averaged around each ring.
  const perPixel = ap.lens ? ap.count * (8 + 0.4 * g.k * ap.lens.radius) : ap.count;
  job = { fieldRow: 0, screenRow: 0, perPixel };
}

// Does one frame's share of the calculation, finishing it if it can.
function continueCompute() {
  let budget = SUMS_PER_FRAME;
  const band = (material, target, done) => {
    const rows = Math.min(
      target.height - done,
      Math.max(1, Math.floor(budget / (target.width * job.perPixel))),
    );
    runPass(material, target, done, rows);
    budget -= rows * target.width * job.perPixel;
    return done + rows;
  };
  while (budget > 0 && job.fieldRow < g.H) job.fieldRow = band(fieldPass, fieldRT, job.fieldRow);
  while (budget > 0 && job.screenRow < g.H) job.screenRow = band(screenPass, screenRT, job.screenRow);
  if (job.screenRow < g.H) return;

  // Read the screen back once to scale it to its brightest point.
  renderer.readRenderTargetPixels(screenRT, 0, 0, g.H, g.H, readBack);
  let max = 1e-9;
  for (let i = 2; i < readBack.length; i += 4) max = Math.max(max, readBack[i]);
  U.uMaxIntensity.value = max;
  runPass(screenColorPass, screenColorRT);
  job = null;
}

// ---- Drawing ----------------------------------------------------------------

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width === Math.round(w * renderer.getPixelRatio()) && camera.aspect === w / h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// 0 in the cross section, 1 in the full view, and in between while
// switching.
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

  const target = params.view === "full" ? 1 : 0;
  const step = dt / TRANSITION;
  viewT = target > viewT ? Math.min(target, viewT + step) : Math.max(target, viewT - step);

  phase += phaseStep(g);
  uPhase.value.set(Math.cos(phase), Math.sin(phase));
  resize();
  uStrip.value = 1 - layout(viewT);
  runPass(sliceColorPass, sliceColorRT);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
