// Double slit on the CPU: the wave equation is stepped over plain
// Float32Arrays and the result is copied into an ImageData each frame.

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
  isWall,
  makeSource,
  spongeAt,
  stepsPerFrame,
  wavelengthColor,
} from "./common.js";

const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d");
const controls = createControls(document.getElementById("controls"), { onChange });
const params = controls.params;

let g, prev, cur, next, sigma, wall, srcCells, intensity, image, source;

function reset() {
  g = geometry(params);
  canvas.width = g.W + g.stripW;
  canvas.height = g.H;

  const n = g.W * g.H;
  prev = new Float32Array(n);
  cur = new Float32Array(n);
  next = new Float32Array(n);
  sigma = new Float32Array(n);
  wall = new Uint8Array(n);
  srcCells = [];
  for (let y = 0; y < g.H; y++) {
    for (let x = 0; x < g.W; x++) {
      const i = y * g.W + x;
      sigma[i] = spongeAt(g, x, y);
      wall[i] = isWall(g, x, y) ? 1 : 0;
      if ((x - g.srcX) ** 2 + (y - g.srcY) ** 2 <= g.srcRadius ** 2) srcCells.push(i);
    }
  }

  intensity = new Float32Array(g.H);
  image = ctx.createImageData(canvas.width, canvas.height);
  for (let p = 3; p < image.data.length; p += 4) image.data[p] = 255;
  source = makeSource();
}

function onChange(key) {
  if (RESET_KEYS.has(key)) reset();
  else if (key === "wavelength") intensity.fill(0);
}

function step() {
  const { W, H } = g;
  for (let y = 1; y < H - 1; y++) {
    let i = y * W + 1;
    for (let x = 1; x < W - 1; x++, i++) {
      if (wall[i]) {
        next[i] = 0;
        continue;
      }
      const u = cur[i];
      const lap = cur[i - 1] + cur[i + 1] + cur[i - W] + cur[i + W] - 4 * u;
      const s = sigma[i];
      next[i] = (2 * u - (1 - s) * prev[i] + C2 * lap) / (1 + s);
    }
  }

  const value = advanceSource(source, params, g);
  for (const i of srcCells) next[i] = value;

  for (let y = 0; y < H; y++) {
    const u = next[y * W + g.screenX];
    intensity[y] += (u * u - intensity[y]) * AVG;
  }

  [prev, cur, next] = [cur, next, prev];
}

function draw() {
  const { W, H, r } = g;
  const stride = canvas.width;
  const data = image.data;
  const hue = wavelengthColor(params.wavelength);

  // Crests light up in the wavelength's color; troughs stay dark.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const p = (y * stride + x) * 4;
      if (wall[i]) {
        data[p] = WALL[0];
        data[p + 1] = WALL[1];
        data[p + 2] = WALL[2];
        continue;
      }
      const a = Math.max(Math.tanh(GAIN * cur[i]), 0);
      data[p] = BG[0] + (hue[0] - BG[0]) * a;
      data[p + 1] = BG[1] + (hue[1] - BG[1]) * a;
      data[p + 2] = BG[2] + (hue[2] - BG[2]) * a;
    }
  }

  // The screen strip on the right: time-averaged intensity at the
  // screen column, normalized to its brightest point.
  let max = 1e-9;
  for (const v of intensity) if (v > max) max = v;
  for (let y = 0; y < H; y++) {
    const b = Math.pow(intensity[y] / max, 0.8);
    for (let x = W; x < stride; x++) {
      const p = (y * stride + x) * 4;
      const gap = x < W + 2 * r;
      for (let c = 0; c < 3; c++) {
        data[p + c] = gap ? BG[c] * 0.5 : BG[c] + (hue[c] - BG[c]) * b;
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
  const steps = controls.paused ? 0 : stepsPerFrame(g);
  for (let k = 0; k < steps; k++) step();
  draw();
  controls.frame(steps * g.W * g.H);
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
