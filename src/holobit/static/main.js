// Wires the simulator together, drawn with three.js on WebGL2.
//
// - physics/: the core calculation. aperture.js turns the chosen aperture
//   into wavelets; wavefield.js adds them up at every point on the GPU.
// - view/: how the light is drawn, and the 3D scene.
// - ui/: the controls, their explanations and the tour.
//
// When a setting changes, the light is recomputed into float textures,
// bands of rows of the cross section and the screen each frame, the
// screen shown as it fills in. Every frame the cross section is colored
// at the current phase, so the waves move, and the scene is drawn.

import * as THREE from "three";
import { FULLSCREEN_VERTEX } from "./glsl.js";
import { aperture } from "./physics/aperture.js";
import { geometry } from "./physics/layout.js";
import { FIELD_SHADER, SCREEN_SHADER, SCREEN_STEP } from "./physics/wavefield.js";
import { createControls } from "./ui/controls.js";
import {
  eyeFade,
  eyePlace,
  FIELD_ROW_MAX_SHADER,
  ghost,
  phaseStep,
  SCREEN_COLOR_SHADER,
  SLICE_COLOR_SHADER,
  wavelengthColor,
} from "./view/display.js";
import { createScene } from "./view/scene.js";

// Seconds the switch between views takes.
const TRANSITION = 1.6;
// Wavelet sums to do per drawn frame. A heavy case (the holograms) is spread
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
// The layout's sizes don't change with the settings, apart from the
// plate's, so the targets and scene are built once from the first
// geometry.
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

// RGBA floats as a texture, a row of them unless given a width, for the
// shaders to look up.
function dataTexture(data, width = data.length / 4) {
  const tex = new THREE.DataTexture(data, width, data.length / 4 / width, THREE.RGBAFormat, THREE.FloatType);
  tex.needsUpdate = true;
  return tex;
}

// The computed light: the cross section, and the screen face on, more
// coarsely.
const S = g.H / SCREEN_STEP;
const fieldRT = floatTarget(g.screenX, g.H);
const screenRT = floatTarget(S, S);
// What is drawn from it.
const sliceColorRT = colorTarget(g.W + g.stripW, g.H);
// The brightest light in each row of the cross section beyond the plate.
const fieldRowMaxRT = floatTarget(1, g.H);
const screenColorRT = colorTarget(S, S);
// The image the eye's lens casts on its retina, with the beam reversed:
// the virtual image on the screen, in the light's color, as real light.
const retinaColorRT = colorTarget(S, S);

// Per row of the aperture line: [kind, block, depth, 0].
const rowsData = new Float32Array(g.H * 4);
const rowsTex = dataTexture(rowsData);

// ---- Shader passes ----------------------------------------------------------

// Uniforms shared by every pass, so one update reaches all of them.
const U = {
  uK: { value: 0 },
  uCurvature: { value: 0 },
  uBeamDir: { value: new THREE.Vector2() },
  uSourceX: { value: 0 },
  uSourceY: { value: 0 },
  uApertureX: { value: g.apertureX },
  uWallHalf: { value: g.wallHalf },
  uApertureHalf: { value: g.apertureSize / 2 },
  uLit: { value: new THREE.Vector2() },
  uBeamGap: { value: 0 },
  uCenterY: { value: g.centerY },
  uRows: { value: rowsTex },
  uWavelets: { value: null },
  uWaveletCount: { value: 0 },
  uPlate: { value: null },
  uPlateRows: { value: 0 },
  uPlateCols: { value: 0 },
  uPlateStep: { value: 1 },
  uMode: { value: 0 },
  uScreen: { value: screenRT.texture },
  uHue: { value: new THREE.Vector3() },
  uMaxIntensity: { value: 1e-9 },
  uFieldMax: { value: 1 },
  uReversed: { value: false },
  uGhost: { value: 1 },
  uEyeFade: { value: 1 },
  uEyeY: { value: 0 },
  uFlatTop: { value: false },
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

const fieldPass = pass(FIELD_SHADER, { ...U, uMirror: { value: true } });
const screenPass = pass(SCREEN_SHADER, { ...U, uMirror: { value: false }, uScreenX: { value: g.screenX } });
const screenColorPass = pass(SCREEN_COLOR_SHADER, { ...U, uFade: { value: 1 } });
const retinaColorPass = pass(SCREEN_COLOR_SHADER, { ...U, uReversed: { value: false }, uFade: U.uEyeFade });
const fieldRowMaxPass = pass(FIELD_ROW_MAX_SHADER, { ...U, uField: { value: fieldRT.texture } });
const sliceColorPass = pass(SLICE_COLOR_SHADER, {
  ...U,
  uField: { value: fieldRT.texture },
  uPhase,
  uStrip,
  uWidth: { value: g.screenX },
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

const { scene, camera, layout, drawAperture, placeRetina } = createScene(
  g,
  sliceColorRT.texture,
  screenColorRT.texture,
  retinaColorRT.texture,
);
const readBack = new Float32Array(S * S * 4);
// The brightest point of each row of the screen, as computed, so the
// screen can be scaled to the brightest point it shows while it fills in.
const rowMax = new Float32Array(S);
const fieldRowMax = new Float32Array(g.H * 4);
// The calculation in progress, or null when the light is up to date.
let job = null;

// Starts recomputing the light for the current settings.
function startCompute() {
  // A reversed beam is worked out as the mirror image of the beam at the
  // opposite angle (see wavefield.js).
  g = geometry(params.reversed ? { ...params, angle: -params.angle } : params);
  const ap = aperture(params, g);
  for (let row = 0; row < g.H; row++) {
    rowsData.set([ap.kind[row], ap.block[row], ap.depth[row], 0], row * 4);
  }
  rowsTex.needsUpdate = true;
  U.uWavelets.value?.dispose();
  U.uWavelets.value = dataTexture(ap.wavelets);
  U.uWaveletCount.value = ap.count;
  U.uPlate.value?.dispose();
  U.uPlate.value = ap.plate ? dataTexture(ap.plate.data, ap.plate.cols) : dataTexture(new Float32Array(4));
  U.uPlateRows.value = ap.plate?.rows ?? 0;
  U.uPlateCols.value = ap.plate?.cols ?? 0;
  U.uPlateStep.value = ap.plate?.step ?? 1;
  U.uMode.value = ap.mode;
  U.uLit.value.set(...ap.lit);
  U.uBeamGap.value = ap.beamGap;
  U.uK.value = g.k;
  U.uCurvature.value = g.curvature;
  U.uApertureHalf.value = ap.beamHalf;
  U.uFlatTop.value = ap.flatTop;
  U.uBeamDir.value.set(...g.beamDir);
  U.uSourceX.value = g.sourceX;
  U.uSourceY.value = g.sourceY;
  U.uHue.value.set(...wavelengthColor(params.wavelength).map((c) => c / 255));
  drawAperture(ap, g);
  U.uReversed.value = params.reversed;
  const eye = eyePlace(g, ap.seen);
  U.uEyeY.value = eye.y;
  placeRetina(params.reversed ? eye : null);

  // How many wavelet sums each pixel needs: one per slit row, or one per
  // point of a hologram's grid, only half of them in the cross section.
  // With the beam reversed, the columns before the plate need them, and
  // for a hologram, its virtual light beyond the plate and on the screen;
  // otherwise the screen gets no light, which takes no summing.
  const { rows, cols } = ap.plate ?? {};
  const fieldCost = ap.plate ? (rows * (cols + 1)) / 2 : ap.count;
  const screenCost = ap.plate ? rows * cols : params.reversed ? 1 : ap.count;
  job = { fieldRow: 0, screenRow: 0, fieldCost, screenCost };
}

// Does one frame's share of the calculation. The cross section and the
// screen share the frame's budget in proportion to their work, so they
// fill in together; whatever one leaves, the other takes.
function continueCompute() {
  let budget = SUMS_PER_FRAME;
  // Computes rows of target from row done on, using up to `share` sums,
  // at `cost` sums a pixel. Returns the row reached.
  const band = (material, target, done, share, cost) => {
    const rows = Math.min(target.height - done, Math.max(1, Math.floor(share / (target.width * cost))));
    runPass(material, target, done, rows);
    budget -= rows * target.width * cost;
    return done + rows;
  };
  const screenStart = job.screenRow;
  const fieldStart = job.fieldRow;
  const screenWork = S * S * job.screenCost;
  const screenShare = (budget * screenWork) / (g.screenX * g.H * job.fieldCost + screenWork);
  if (job.screenRow < S) job.screenRow = band(screenPass, screenRT, job.screenRow, screenShare, job.screenCost);
  while (budget > 0 && job.fieldRow < g.H) {
    job.fieldRow = band(fieldPass, fieldRT, job.fieldRow, budget, job.fieldCost);
  }
  while (budget > 0 && job.screenRow < S) {
    job.screenRow = band(screenPass, screenRT, job.screenRow, budget, job.screenCost);
  }

  // Read back the screen's new rows, and redraw it scaled to the
  // brightest point it now shows: the new rows, and the previous
  // picture's in the rows still to come.
  const rows = job.screenRow - screenStart;
  if (rows > 0) {
    renderer.readRenderTargetPixels(screenRT, 0, screenStart, S, rows, readBack);
    for (let r = 0; r < rows; r++) {
      let max = 0;
      for (let i = r * S * 4 + 2; i < (r + 1) * S * 4; i += 4) max = Math.max(max, readBack[i]);
      rowMax[screenStart + r] = max;
    }
    U.uMaxIntensity.value = Math.max(1e-9, ...rowMax);
    runPass(screenColorPass, screenColorRT);
  }
  // Likewise scale the cross section to the brightest light beyond the
  // plate, finding it on the GPU and reading back one value per row.
  if (job.fieldRow > fieldStart) {
    runPass(fieldRowMaxPass, fieldRowMaxRT);
    renderer.readRenderTargetPixels(fieldRowMaxRT, 0, 0, 1, g.H, fieldRowMax);
    let max = 1;
    for (let i = 0; i < fieldRowMax.length; i += 4) max = Math.max(max, fieldRowMax[i]);
    U.uFieldMax.value = max;
  }
  if (job.fieldRow >= g.H && job.screenRow >= S) job = null;
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
  // Virtual light fades in and out, on the screen too.
  U.uGhost.value = ghost(now / 1000);
  U.uEyeFade.value = eyeFade(now / 1000);
  if (U.uReversed.value) {
    runPass(screenColorPass, screenColorRT);
    runPass(retinaColorPass, retinaColorRT);
  }
  runPass(sliceColorPass, sliceColorRT);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
