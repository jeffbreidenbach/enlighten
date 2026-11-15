// The apertures, and the wavelets each one sends on.
//
// Light is a steady wave of one color, so each point holds a complex
// amplitude: a strength and a phase. By Huygens' principle, every open
// point of the aperture plate re-radiates the light that reaches it as a
// small wavelet, and the light anywhere beyond the plate is the sum of
// those wavelets. This file works out, once per change of settings, what
// each wavelet starts with; wavefield.js adds them up at every point.
//
// Slits and the grating are made of full-width rows, each summed along its
// length in closed form. Holograms vary in both directions across the
// plate, so they are sampled on a grid of points across it.

import { DEFAULT_WAVELENGTH, wavelengthCells } from "./layout.js";

export const APERTURES = {
  single: "Single slit",
  double: "Double slit",
  grating: "Sine grating",
  point: "Hologram of a point",
  point2: "Hologram of two points",
  square: "Hologram of a square",
};

// Slits run the full width of the aperture plate, so in the cross section
// each is an opening at a fixed height: [center, half width], in base
// cells. At 550 nm a wavelength is 4 base cells.
const SLITS = {
  // 1 wavelength wide.
  single: [[0, 2]],
  // 1 wavelength wide each, 10 wavelengths apart.
  double: [
    [-20, 2],
    [20, 2],
  ],
};

// The sine grating's transparency follows a cosine across the plate: what
// two interfering plane waves record on film, so the simplest hologram.
// Its period is the default wavelength times the square root of 2, so a
// plane wave arriving at 45 degrees sends its first order straight out
// along the normal (the grating equation: period = wavelength / sin 45).
const GRATING_PERIOD = wavelengthCells(DEFAULT_WAVELENGTH) * Math.SQRT2;

// Holograms, recorded on film: the light of an object on the screen
// shines back onto the film, where it meets a plane wave, the reference
// beam, and the film records how bright their interference is. They are
// recorded in green light, at the default wavelength, and are bleached, as
// holograms usually are: the dark of the film turns clear but thicker, so
// its fringes delay the light instead of blocking it, and send far more of
// it into the image.
//
// The reference beam arrives at 45 degrees, the angle the sine grating
// bends straight ahead: a point hologram is that grating with its fringes
// gently curved, so it bends the light straight ahead and focuses it too.
// Lit again by the reference beam, only the image reaches the screen: the
// leftover light carries on at 45 degrees and misses it, and the mirror
// image the film also makes would have to leave at an impossible angle,
// so dies out at the plate.
//
// Each object is a set of points on the screen, [height, distance out of
// the cross section], in base cells. The point is 40 cells up the screen,
// and the two points are it and its mirror image. The square is an
// outline SQUARE_SIDE across, centered on the screen, drawn as points
// SQUARE_SPACING apart, close enough that the image blurs them into lines.
//
// Each point's light is timed to reach the middle of the film together
// with the others', as if the object were lit by light converging on the
// film. The object's light then gathers in the middle of the film, where
// the beam is brightest, and every point's light spreads over the whole
// film, so every part of the image is as sharp as the hologram allows.
// (Points glowing in step instead would cast a blurred shadow of a large
// object, wider than the beam; random phases, like a matt surface's, would
// break the image up into speckle at this size.)
const REFERENCE_ANGLE = 45;
const POINT_HEIGHT = 40;
const SQUARE_SIDE = 128;
const SQUARE_SPACING = 4;
const OBJECTS = {
  point: [[POINT_HEIGHT, 0]],
  point2: [
    [-POINT_HEIGHT, 0],
    [POINT_HEIGHT, 0],
  ],
  square: squarePoints(),
};

function squarePoints() {
  const points = [];
  const half = SQUARE_SIDE / 2;
  for (let t = -half; t < half; t += SQUARE_SPACING) {
    points.push([t, -half], [half, t], [-t, half], [-half, -t]);
  }
  return points;
}

// How far bleaching delays the light where the film was darkest, in
// radians: the depth that sends the most light into a point's image,
// about a third of it.
const BLEACH = 1.84;

// The grid of points a hologram is sampled at, in base cells: a quarter
// of a wavelength apart at 550 nm. Waves leaving the hologram at steep
// angles need the grid this fine, or they would be mistaken for waves at
// other angles.
const PLATE_STEP = 1;

// The beam has soft edges, like a laser's Gaussian profile: its strength
// falls as exp(-BEAM_FALLOFF t^2), where t runs from 0 at the plate's
// center to 1 at its edge (down to 5% there). Sharp edges would throw off
// ripples of their own.
export const BEAM_FALLOFF = 3;

export function beamProfile(g, d) {
  const t = d / (g.apertureSize / 2);
  return Math.exp(-BEAM_FALLOFF * t * t);
}

// What each row of the aperture line is, in the cross section. Rows
// beyond the plate are 0: no light reaches them.
export const ROW_WALL = 1;
export const ROW_OPEN = 2;
export const ROW_HOLOGRAM = 3;

// How the wavelets are summed: along full-width slits, or over the grid
// of points across a hologram.
export const MODE_SLITS = 0;
export const MODE_PLATE = 1;

// What the film recorded at each point of the grid across the plate, -1
// to 1: the interference of the object's light, converging on it, with
// the reference beam. Recording depends only on the hologram and the
// plate's size, so each is recorded once and kept.
const recordings = new Map();

function record(g, name, grid) {
  const key = `${name} ${grid.n} ${grid.step}`;
  if (recordings.has(key)) return recordings.get(key);
  const k = (2 * Math.PI) / (wavelengthCells(DEFAULT_WAVELENGTH) * g.scale);
  const toScreen = g.screenX - g.apertureX;
  const refDir = -Math.sin((REFERENCE_ANGLE * Math.PI) / 180);
  const points = OBJECTS[name].map(([y, z]) => {
    const [py, pz] = [y * g.scale, z * g.scale];
    return [py, pz, Math.hypot(toScreen, py, pz)];
  });
  // The object's light at each point of the grid, relative to the
  // reference beam: each point's light, converging on it, is behind by
  // k (r - center), r the distance to it and center its distance to the
  // middle of the film.
  const light = new Float32Array(grid.n * grid.n * 2);
  let brightest = 0;
  for (let i = 0; i < grid.n; i++) {
    const y = (i - grid.mid) * grid.step;
    for (let j = 0; j < grid.n; j++) {
      const z = (j - grid.mid) * grid.step;
      let re = 0;
      let im = 0;
      for (const [py, pz, center] of points) {
        const r = Math.hypot(toScreen, y - py, z - pz);
        const phase = k * (r - center) + k * refDir * y;
        re += (toScreen / r) * Math.cos(phase);
        im += (toScreen / r) * Math.sin(phase);
      }
      light.set([re, im], (i * grid.n + j) * 2);
      brightest = Math.max(brightest, Math.hypot(re, im));
    }
  }
  // The fringes are as deep as the object's light is strong there, scaled
  // so the strongest just reach full depth.
  const exposure = new Float32Array(grid.n * grid.n);
  for (let i = 0; i < exposure.length; i++) exposure[i] = light[2 * i] / brightest;
  recordings.set(key, exposure);
  return exposure;
}

// The light arriving at (z, y) on the plate, the same as incident() in
// wavefield.js: its strength, how much farther it has come than to the
// plate's center, and its curvature there.
function arriving(g, y, z = 0) {
  const c = g.curvature;
  const along = y * g.beamDir[1];
  const q2 = y * y + z * z;
  const m = Math.sqrt(1 + 2 * c * along + c * c * q2);
  return { amplitude: 1 / m, delay: (2 * along + c * q2) / (1 + m), curvature: c / m };
}

// Describes the aperture for the current settings.
//
// For drawing, per row of the cross section's aperture line:
// - kind: ROW_WALL, ROW_OPEN or ROW_HOLOGRAM (0 beyond the plate).
// - block: how much an open row blocks, 0 to 1 (only the sine grating's
//   rows block partly).
// - depth: for hologram rows, how far they delay the light, 0 to 1.
//
// For the sums:
// - slits: `wavelets` holds [row height, re, im, curvature of the light
//   arriving there] per open row. Each is a full-width strip; the sum
//   along its length is done in closed form (a standard stationary-phase
//   result), leaving one term per row. re and im include the light
//   arriving from the source.
// - holograms: `plate` holds the light leaving each point of the grid
//   across it, [re, im, 0, 0]: plate.n points on a side, plate.step grid
//   cells apart, centered on the plate, plate.mid the middle one. Its
//   `exposure` is what the film recorded at each.
// Light is scaled so the incoming wave has strength 1 and phase 0 at the
// plate's center.
export function aperture(params, g) {
  const plate = OBJECTS[params.aperture] ? plateGrid(g, params.aperture) : null;
  const kind = new Uint8Array(g.H);
  const block = new Float32Array(g.H);
  const depth = new Float32Array(g.H);
  const list = [];

  for (let row = 0; row < g.H; row++) {
    const y = row - g.centerY;
    if (Math.abs(y) > g.apertureSize / 2) continue;
    kind[row] = ROW_WALL;

    if (plate) {
      kind[row] = ROW_HOLOGRAM;
      depth[row] = shade(plate, 0, y);
      continue;
    }

    // How much of the arriving light this row lets through.
    let pass;
    if (params.aperture === "grating") {
      pass = 0.5 + 0.5 * Math.cos((2 * Math.PI * y) / (GRATING_PERIOD * g.scale));
    } else {
      const open = SLITS[params.aperture].some(
        ([center, half]) => Math.abs(y - center * g.scale) <= half * g.scale,
      );
      pass = open ? 1 : 0;
    }
    if (pass === 0) continue;
    kind[row] = ROW_OPEN;
    block[row] = 1 - pass;

    // Summing along the strip gives strength sqrt(k / 2 pi) and a 45
    // degree lag, on top of the light arriving here. The shader needs the
    // arriving light's curvature, 1 / its distance from the source.
    const strength = Math.sqrt(g.k / (2 * Math.PI)) * pass * beamProfile(g, y);
    const { amplitude, delay, curvature } = arriving(g, y);
    list.push([y, strength * amplitude, g.k * delay - Math.PI / 4, curvature]);
  }

  const wavelets = new Float32Array(Math.max(list.length, 1) * 4);
  list.forEach(([pos, strength, phase, extra], i) => {
    wavelets.set([pos, strength * Math.cos(phase), strength * Math.sin(phase), extra], i * 4);
  });
  return {
    mode: plate ? MODE_PLATE : MODE_SLITS,
    kind,
    block,
    depth,
    plate,
    wavelets,
    count: list.length,
  };
}

// How far a hologram delays the light at (z, y) on the plate, 0 to 1,
// from the nearest point of its grid; for drawing.
export function shade(plate, z, y) {
  const at = (v) => Math.max(0, Math.min(plate.n - 1, Math.round(v / plate.step) + plate.mid));
  return 0.5 + 0.5 * plate.exposure[at(y) * plate.n + at(z)];
}

// The light leaving each point of the grid across a hologram: what
// arrives there, delayed by the bleached film. Each point stands for the
// patch of plate around it: area step^2, which by Huygens' principle
// radiates k / 2 pi times as strongly, with a 90 degree lag.
function plateGrid(g, name) {
  const step = PLATE_STEP * g.scale;
  const mid = Math.floor(g.apertureSize / 2 / step);
  const n = 2 * mid + 1;
  const exposure = record(g, name, { n, mid, step });
  const data = new Float32Array(n * n * 4);
  const weight = (g.k / (2 * Math.PI)) * step * step;
  for (let i = 0; i < n; i++) {
    const y = (i - mid) * step;
    for (let j = 0; j < n; j++) {
      const z = (j - mid) * step;
      const { amplitude, delay } = arriving(g, y, z);
      const strength = weight * amplitude * beamProfile(g, Math.hypot(y, z));
      const phase = g.k * delay + BLEACH * exposure[i * n + j] - Math.PI / 2;
      data.set([strength * Math.cos(phase), strength * Math.sin(phase), 0, 0], (i * n + j) * 4);
    }
  }
  return { n, mid, step, data, exposure };
}
