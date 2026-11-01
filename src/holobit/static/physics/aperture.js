// The apertures, and the wavelets each one sends on.
//
// Light is a steady wave of one color, so each point holds a complex
// amplitude: a strength and a phase. By Huygens' principle, every open
// point of the aperture plate re-radiates the light that reaches it as a
// small wavelet, and the light anywhere beyond the plate is the sum of
// those wavelets. This file works out, once per change of settings, what
// each wavelet starts with; wavefield.js adds them up at every point.

import { DEFAULT_WAVELENGTH, wavelengthCells } from "./layout.js";

export const APERTURES = {
  single: "Single slit",
  double: "Double slit",
  grating: "Sine grating",
  lens: "Fresnel lens",
  lens2: "Two Fresnel lenses",
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

// Round Fresnel lenses: their centers' heights and radius, in base cells.
// The single lens sits 15 cells above the axis, so it images the on-axis
// source to a spot about 105 cells up the screen: its light visibly bends,
// and can't be mistaken for light passing straight through. An off-center
// piece of a lens like this is a grating plus a lens, which is what an
// off-axis hologram of a point is. The two lenses overlap; where they do,
// the plate passes half of each.
const LENSES = {
  lens: { centers: [15], radius: 25 },
  lens2: { centers: [-10, 10], radius: 28 },
};

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
export const ROW_LENS = 3;

// How the wavelets are summed: along full-width slits, or around the
// rings of a round lens.
export const MODE_SLITS = 0;
export const MODE_LENS = 1;

// The phase delay a perfect lens adds at distance rho from its center, so
// that light arriving along its own axis all reaches the focus in step:
// the path from the source (none for a plane wave, which comes from
// infinitely far away) plus the path to the focus, compared with the path
// straight through the center. The lens focuses on the screen. It is
// fixed, so tilting the light moves the focus rather than changing the
// lens.
function lensDelay(g, rho) {
  const toSource = g.sourceDistance;
  const toFocus = g.screenX - g.apertureX;
  const fromSource = g.planeWave ? 0 : Math.hypot(rho, toSource) - toSource;
  return g.k * (fromSource + Math.hypot(rho, toFocus) - toFocus);
}

// A Fresnel lens wraps that delay every full wavelength, which is what
// its grooves are. How far through a groove rho sits, 0 to 1; used only
// for drawing.
export function lensGroove(g, rho) {
  return (lensDelay(g, rho) / (2 * Math.PI)) % 1;
}

// Describes the aperture for the current settings.
//
// For drawing, per row of the cross section's aperture line:
// - kind: ROW_WALL, ROW_OPEN or ROW_LENS (0 beyond the plate).
// - block: how much an open row blocks, 0 to 1 (only the sine grating's
//   rows block partly).
// - groove: for lens rows, how far through a groove the row sits.
//
// For the sums, `wavelets` holds four floats per wavelet:
// - slits: [row height, re, im, distance from the point source]. Each
//   open row is a full-width strip; the sum along its length is done in
//   closed form (a standard stationary-phase result), leaving one term
//   per row. re and im include the light arriving from the source.
// - lenses: [ring radius, re, im, lens center height]. The shader
//   averages each ring over points around it, working out the light
//   arriving at each, since an off-center source lights a ring unevenly.
// Light is scaled so the incoming wave has strength 1 where it meets the
// plate on the axis; a plane wave has strength 1 everywhere.
//
// `lens` is the lens layout in grid cells, or null.
export function aperture(params, g) {
  const layout = LENSES[params.aperture];
  const lens = layout && {
    centers: layout.centers.map((c) => c * g.scale),
    radius: layout.radius * g.scale,
  };
  const kind = new Uint8Array(g.H);
  const block = new Float32Array(g.H);
  const groove = new Float32Array(g.H);
  const list = [];

  for (let row = 0; row < g.H; row++) {
    const y = row - g.centerY;
    if (Math.abs(y) > g.apertureSize / 2) continue;
    kind[row] = ROW_WALL;

    if (lens) {
      const c = lens.centers.find((c) => Math.abs(y - c) <= lens.radius);
      if (c === undefined) continue;
      kind[row] = ROW_LENS;
      groove[row] = lensGroove(g, Math.abs(y - c));
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
    // degree lag. A plane wave then arrives with only its tilt's phase; a
    // point source's light has travelled R to get here, which sets its
    // phase, and 1 / sqrt(R) is what remains of its fall-off.
    const strength = Math.sqrt(g.k / (2 * Math.PI)) * pass * beamProfile(g, y);
    if (g.planeWave) {
      list.push([y, strength, g.k * g.beamDir[1] * y - Math.PI / 4, 0]);
    } else {
      const R = Math.hypot(g.apertureX - g.sourceX, y - g.sourceY);
      const scaled = (strength * g.sourceDistance) / Math.sqrt(R);
      list.push([y, scaled, g.k * R - Math.PI / 4, R]);
    }
  }

  for (const center of lens?.centers ?? []) {
    for (let i = 0; i + 0.5 <= lens.radius; i++) {
      const rho = i + 0.5;
      // A ring of radius rho has strength k rho (per unit of radius) and a
      // 90 degree lag, then the lens's own delay.
      const strength = (g.k * rho) / lens.centers.length;
      list.push([rho, strength, -Math.PI / 2 - lensDelay(g, rho), center]);
    }
  }

  const wavelets = new Float32Array(Math.max(list.length, 1) * 4);
  list.forEach(([pos, strength, phase, extra], i) => {
    wavelets.set([pos, strength * Math.cos(phase), strength * Math.sin(phase), extra], i * 4);
  });
  return {
    mode: lens ? MODE_LENS : MODE_SLITS,
    kind,
    block,
    groove,
    lens,
    wavelets,
    count: list.length,
  };
}
