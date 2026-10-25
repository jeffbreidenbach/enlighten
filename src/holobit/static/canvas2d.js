// Steady-state optics on the CPU. The complex field is summed in plain
// JavaScript a few rows per frame, so the page stays responsive while it
// fills in, then each frame just turns the phase and redraws.

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
  incident,
  phaseStep,
  wavelengthColor,
} from "./common.js";

const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d");
const controls = createControls(document.getElementById("controls"), { onChange: restart });
const params = controls.params;

// Time spent summing the field per frame, in milliseconds.
const COMPUTE_BUDGET = 12;

let g, ap, openRows, fieldRe, fieldIm, nextRow, started, image;
let phase = 0;

function restart() {
  const resized = !g || g.r !== params.resolution;
  g = geometry(params);
  ap = aperture(params, g);
  openRows = Int32Array.from(ap.kind.keys()).filter((y) => ap.kind[y] !== ROW_WALL);
  if (resized) {
    canvas.width = g.W + g.stripW;
    canvas.height = g.H;
    fieldRe = new Float32Array(g.W * g.H);
    fieldIm = new Float32Array(g.W * g.H);
    image = ctx.createImageData(canvas.width, canvas.height);
    for (let p = 3; p < image.data.length; p += 4) image.data[p] = 255;
  }
  nextRow = 0;
  started = performance.now();
}

// Fills one row of the field. Left of the wall it is the source's wave;
// right of it, the sum of wavelets from every open row of the wall.
function computeRow(y) {
  const { W, k, barrierX, barrierHalf } = g;
  const { re, im } = ap;
  for (let x = 0; x < W; x++) {
    let ur = 0;
    let ui = 0;
    if (x > barrierX + barrierHalf) {
      const dx = x - barrierX;
      for (const ya of openRows) {
        const dy = y - ya;
        const d = Math.sqrt(dx * dx + dy * dy);
        // Wavelets are weaker sideways (the obliquity factor) and fade
        // with the square root of distance, as 2D waves do.
        const w = (0.5 * (1 + dx / d)) / Math.sqrt(d);
        const c = Math.cos(k * d);
        const s = Math.sin(k * d);
        ur += w * (re[ya] * c - im[ya] * s);
        ui += w * (re[ya] * s + im[ya] * c);
      }
    } else if (x < barrierX - barrierHalf || ap.kind[y] !== ROW_WALL) {
      [ur, ui] = incident(g, x, y);
    }
    fieldRe[y * W + x] = ur;
    fieldIm[y * W + x] = ui;
  }
}

function draw() {
  const { W, H, r, barrierX, barrierHalf, screenX } = g;
  const stride = canvas.width;
  const data = image.data;
  const hue = wavelengthColor(params.wavelength);
  const c = Math.cos(phase);
  const s = Math.sin(phase);

  // Crests light up in the wavelength's color; troughs stay dark.
  for (let y = 0; y < H; y++) {
    const kind = ap.kind[y];
    for (let x = 0; x < W; x++) {
      const p = (y * stride + x) * 4;
      let color = hue;
      let a;
      if (Math.abs(x - barrierX) <= barrierHalf && kind !== ROW_OPEN) {
        color = kind === ROW_WALL ? WALL : GLASS;
        a = kind === ROW_WALL ? 1 : 0.45 + 0.55 * ap.groove[y];
      } else {
        const i = y * W + x;
        a = Math.max(Math.tanh(GAIN * (fieldRe[i] * c + fieldIm[i] * s)), 0);
      }
      data[p] = BG[0] + (color[0] - BG[0]) * a;
      data[p + 1] = BG[1] + (color[1] - BG[1]) * a;
      data[p + 2] = BG[2] + (color[2] - BG[2]) * a;
    }
  }

  // The screen strip on the right: intensity at the screen column,
  // normalized to its brightest point. Rows not yet recomputed after a
  // change still show the previous field, so the picture never blanks.
  let max = 1e-9;
  const intensity = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    const i = y * W + screenX;
    intensity[y] = fieldRe[i] ** 2 + fieldIm[i] ** 2;
    max = Math.max(max, intensity[y]);
  }
  for (let y = 0; y < H; y++) {
    const b = Math.pow(intensity[y] / max, 0.8);
    for (let x = W; x < stride; x++) {
      const p = (y * stride + x) * 4;
      const gap = x < W + 2 * r;
      for (let ch = 0; ch < 3; ch++) {
        data[p + ch] = gap ? BG[ch] * 0.5 : BG[ch] + (hue[ch] - BG[ch]) * b;
      }
    }
  }

  ctx.putImageData(image, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(g.srcX + 0.5, g.srcY + 0.5, 3 * r, 0, 2 * Math.PI);
  ctx.fill();
}

function frame() {
  if (nextRow < g.H) {
    const t0 = performance.now();
    while (nextRow < g.H && performance.now() - t0 < COMPUTE_BUDGET) computeRow(nextRow++);
    if (nextRow === g.H) controls.computed(performance.now() - started);
  }
  if (!controls.paused) phase += phaseStep(g);
  draw();
  controls.frame();
  requestAnimationFrame(frame);
}

restart();
requestAnimationFrame(frame);
