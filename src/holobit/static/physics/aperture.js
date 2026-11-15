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
  circle: "Hologram of a circle",
  stack: "Square and circle, both lit",
  stackSquare: "Square and circle, top half lit",
  stackCircle: "Square and circle, bottom half lit",
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
// The circle is an outline the same size, drawn the same way.
//
// Each point's light is timed to reach the middle of its film together
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
  circle: circlePoints(),
};

function squarePoints() {
  const points = [];
  const half = SQUARE_SIDE / 2;
  for (let t = -half; t < half; t += SQUARE_SPACING) {
    points.push([t, -half], [half, t], [-t, half], [-half, -t]);
  }
  return points;
}

function circlePoints() {
  const count = Math.round((Math.PI * SQUARE_SIDE) / SQUARE_SPACING);
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    return [(SQUARE_SIDE / 2) * Math.sin(angle), (SQUARE_SIDE / 2) * Math.cos(angle)];
  });
}

// Each hologram is one or more objects, each recorded on its own part of
// the plate: [object, part], the part 0 for the whole plate, 1 for its top
// half, -1 for its bottom half. The stacked hologram records the square
// on the top half and the circle on the bottom, both in the same place on
// the screen: the first idea behind holographic stereograms, which record
// a different view on each part of the plate. So that each half is as big
// as a plate of one hologram, the stacked plate is twice as tall as the
// plate size. It is lit either by a beam of its own centered on one half,
// `lit`, or by one wide beam across both. The halves are two plates,
// DIVIDER base cells apart. (The beam would slip through the gap between
// them as a thin sliver of light, which would only clutter the picture;
// it is left out.)
const STACKED = [
  ["square", 1],
  ["circle", -1],
];
const DIVIDER = 2;
const HOLOGRAMS = {
  ...Object.fromEntries(
    Object.keys(OBJECTS).map((name) => [name, { parts: [[name, 0]], lit: 0, stacked: false }]),
  ),
  stack: { parts: STACKED, lit: 0, stacked: true, wide: true },
  stackSquare: { parts: STACKED, lit: 1, stacked: true },
  stackCircle: { parts: STACKED, lit: -1, stacked: true },
};

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

// The one wide beam across both plates of a stacked hologram is shaped to
// them and has a flat top, as holographers get by spreading a laser beam
// wide and using its even middle: its strength falls as
// exp(-BEAM_FALLOFF t^(2 FLAT_TOP)), t as above but across the stacked
// plate, so it lights both plates evenly and fades only at their outer
// edges. (A plain Gaussian that wide would light each plate brightly
// only beside the gap, making blurry, lopsided images.)
export const FLAT_TOP = 3;

function wideBeamProfile(g, y, z, height) {
  const t2 = (y / (height / 2)) ** 2 + (z / (g.apertureSize / 2)) ** 2;
  return Math.exp(-BEAM_FALLOFF * t2 ** FLAT_TOP);
}

// The middle of the beam lighting height y of a plate: its center, or for
// a stacked plate lit one half at a time, the center of y's half.
function beamCenter(g, hologram, y) {
  return hologram.stacked && !hologram.wide ? (y >= 0 ? 1 : -1) * (g.apertureSize / 2) : 0;
}

// Which half of a stacked plate the eye looks through when the beam is
// reversed (see the eye in display.js): the lit half, or with both lit,
// the one params.eyeHalf picks; 0, the whole plate, for others.
function seenPart(params, hologram) {
  if (!hologram?.stacked) return 0;
  return hologram.lit !== 0 ? hologram.lit : params.eyeHalf;
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

//
// Each recording is { exposure, light }: light the object's light at each
// point, relative to the reference beam, [re, im], scaled like the
// exposure, which is its real part.
function record(g, parts, grid) {
  const key = `${JSON.stringify(parts)} ${grid.rows} ${grid.cols} ${grid.step}`;
  if (recordings.has(key)) return recordings.get(key);
  const recording = {
    exposure: new Float32Array(grid.rows * grid.cols),
    light: new Float32Array(grid.rows * grid.cols * 2),
  };
  for (const [name, part] of parts) recordPart(g, OBJECTS[name], part, grid, recording);
  recordings.set(key, recording);
  return recording;
}

// Whether height y on the plate is in part (see HOLOGRAMS).
function inPart(part, y) {
  return part === 0 || (part > 0 ? y >= 0 : y < 0);
}

// Records object on its part of the plate, into recording.
function recordPart(g, object, part, grid, recording) {
  const k = (2 * Math.PI) / (wavelengthCells(DEFAULT_WAVELENGTH) * g.scale);
  const toScreen = g.screenX - g.apertureX;
  const refDir = -Math.sin((REFERENCE_ANGLE * Math.PI) / 180);
  // The middle of this part of the film.
  const middle = (part * grid.rowMid * grid.step) / 2;
  const points = object.map(([y, z]) => {
    const [py, pz] = [y * g.scale, z * g.scale];
    return [py, pz, Math.hypot(toScreen, py - middle, pz)];
  });
  // The object's light at each point of the grid, relative to the
  // reference beam: each point's light, converging on it, is behind by
  // k (r - center), r the distance to it and center its distance to the
  // middle of the film.
  const light = new Float32Array(grid.rows * grid.cols * 2);
  let brightest = 0;
  for (let i = 0; i < grid.rows; i++) {
    const y = (i - grid.rowMid) * grid.step;
    if (!inPart(part, y)) continue;
    for (let j = 0; j < grid.cols; j++) {
      const z = (j - grid.colMid) * grid.step;
      let re = 0;
      let im = 0;
      for (const [py, pz, center] of points) {
        const r = Math.hypot(toScreen, y - py, z - pz);
        const phase = k * (r - center) + k * refDir * y;
        re += (toScreen / r) * Math.cos(phase);
        im += (toScreen / r) * Math.sin(phase);
      }
      light.set([re, im], (i * grid.cols + j) * 2);
      brightest = Math.max(brightest, Math.hypot(re, im));
    }
  }
  // The fringes are as deep as the object's light is strong there, scaled
  // so the strongest just reach full depth.
  for (let i = 0; i < grid.rows; i++) {
    if (!inPart(part, (i - grid.rowMid) * grid.step)) continue;
    for (let j = 0; j < grid.cols; j++) {
      const at = i * grid.cols + j;
      recording.exposure[at] = light[2 * at] / brightest;
      recording.light.set([light[2 * at] / brightest, light[2 * at + 1] / brightest], 2 * at);
    }
  }
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
//   across it, [re, im, and with the beam reversed, the image's light
//   re, im (see plateGrid)]: plate.rows by plate.cols points,
//   plate.step grid cells apart, centered on the plate, plate.rowMid and
//   plate.colMid the middle ones. Its `exposure` is what the film
//   recorded at each.
// - height: how tall the plate is.
// - lit: the heights the beam lights on the plate, [low, high], measured
//   from its center, and beamGap: how far above and below the center the
//   two beams of a stacked plate are centered, or 0 for one beam.
// - beamHalf: how far the beam reaches from its middle to its edge, and
//   flatTop: whether it is the flat-topped wide beam.
// - seen: the height of the middle of the part of the plate the eye looks
//   through when the beam is reversed.
// - gap: how tall the gap between a stacked plate's two halves is.
// Light is scaled so the incoming wave has strength 1 and phase 0 at the
// plate's center.
export function aperture(params, g) {
  const hologram = HOLOGRAMS[params.aperture];
  const seen = seenPart(params, hologram);
  const plate = hologram ? plateGrid(g, hologram, params.reversed, seen) : null;
  // How tall the plate is.
  const height = hologram?.stacked ? 2 * g.apertureSize : g.apertureSize;
  const kind = new Uint8Array(g.H);
  const block = new Float32Array(g.H);
  const depth = new Float32Array(g.H);
  const list = [];

  for (let row = 0; row < g.H; row++) {
    const y = row - g.centerY;
    if (Math.abs(y) > height / 2) continue;
    kind[row] = ROW_WALL;

    if (plate) {
      if (inDivider(g, hologram, y)) {
        kind[row] = 0;
      } else {
        kind[row] = ROW_HOLOGRAM;
        depth[row] = shade(plate, 0, y);
      }
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
    height,
    lit: [hologram?.lit > 0 ? 0 : -height / 2, hologram?.lit < 0 ? 0 : height / 2],
    beamGap: hologram?.stacked && !hologram.wide ? g.apertureSize / 2 : 0,
    beamHalf: hologram?.wide ? height / 2 : g.apertureSize / 2,
    flatTop: Boolean(hologram?.wide),
    seen: (seen * g.apertureSize) / 2,
    gap: hologram?.stacked ? DIVIDER * g.scale : 0,
  };
}

// How far a hologram delays the light at (z, y) on the plate, 0 to 1,
// from the nearest point of its grid; for drawing.
export function shade(plate, z, y) {
  const at = (v, n, mid) => Math.max(0, Math.min(n - 1, Math.round(v / plate.step) + mid));
  return 0.5 + 0.5 * plate.exposure[at(y, plate.rows, plate.rowMid) * plate.cols + at(z, plate.cols, plate.colMid)];
}

// The light leaving each point of the grid across a hologram: what
// arrives there, delayed by the bleached film. Each point stands for the
// patch of plate around it: area step^2, which by Huygens' principle
// radiates k / 2 pi times as strongly, with a 90 degree lag. Where the
// beam lights only half the plate, it fades out over a few grid cells
// across the middle.
//
// With the beam reversed, each point of the part of the plate the eye
// looks through, `seen`, also holds, in its last two values, the light
// the image alone would leave with under the beam the right way round: what arrives there times the conjugate of the object's
// light, so that it converges on the object. Its conjugate, the same
// light running backwards, is the virtual light the reversed beam's light
// seems to come from. g is then the mirrored geometry (see wavefield.js),
// so the beam the right way round arrives at height -y where the mirrored
// one arrives at y. (Virtual light is where light seems to come from to
// a viewer, so only the light that reaches the eye has it.)
function plateGrid(g, hologram, reversed, seen) {
  const step = PLATE_STEP * g.scale;
  const colMid = Math.floor(g.apertureSize / 2 / step);
  const rowMid = hologram.stacked ? 2 * colMid : colMid;
  const [cols, rows] = [2 * colMid + 1, 2 * rowMid + 1];
  const grid = { rows, cols, rowMid, colMid, step };
  const { exposure, light } = record(g, hologram.parts, grid);
  const data = new Float32Array(rows * cols * 4);
  const weight = (g.k / (2 * Math.PI)) * step * step;
  for (let i = 0; i < rows; i++) {
    const y = (i - rowMid) * step;
    const fromCenter = y - beamCenter(g, hologram, y);
    const lit = inDivider(g, hologram, y)
      ? 0
      : hologram.lit === 0
        ? 1
        : smoothstep(-1.5, 1.5, hologram.lit * y);
    for (let j = 0; j < cols; j++) {
      const z = (j - colMid) * step;
      const { amplitude, delay } = arriving(g, y, z);
      const profile = hologram.wide
        ? wideBeamProfile(g, y, z, 2 * rowMid * step)
        : beamProfile(g, Math.hypot(fromCenter, z));
      const strength = weight * amplitude * lit * profile;
      const at = i * cols + j;
      const phase = g.k * delay + BLEACH * exposure[at] - Math.PI / 2;
      data.set([strength * Math.cos(phase), strength * Math.sin(phase)], at * 4);
      if (!reversed || !inPart(seen, y)) continue;
      const forward = g.k * arriving(g, -y, z).delay - Math.PI / 2;
      const [re, im] = [light[2 * at], -light[2 * at + 1]];
      const [c, s] = [strength * Math.cos(forward), strength * Math.sin(forward)];
      data.set([re * c - im * s, re * s + im * c], at * 4 + 2);
    }
  }
  return { ...grid, data, exposure };
}

// Whether height y is in the gap between a stacked plate's two halves.
function inDivider(g, hologram, y) {
  return hologram.stacked && Math.abs(y) <= (DIVIDER / 2) * g.scale;
}

// As in GLSL: 0 below edge0, 1 above edge1, smooth in between.
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
