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
// A lens focuses a plane wave to a spot in line with its center, so the
// single lens is centered at the plate's top edge, 40 cells above the
// axis, and puts its spot 40 cells up the screen: its light visibly bends,
// and can't be mistaken for light passing straight through. It is big
// enough to cover the whole plate, which holds only an off-center piece of
// it: a grating plus a lens, which is what an off-axis hologram of a point
// is. The two lenses are that lens and its mirror image, both covering the
// whole plate, which passes half of each.
const LENS_OFFSET = 40;
const LENS_RADIUS = 80;
const LENSES = {
  lens: { centers: [LENS_OFFSET], radius: LENS_RADIUS },
  lens2: { centers: [-LENS_OFFSET, LENS_OFFSET], radius: LENS_RADIUS },
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
// that a plane wave arriving straight on all reaches the focus in step:
// the path to the focus, compared with the path straight through the
// center. The lens focuses on the screen, on its own axis. It is fixed,
// like a real lens: moving the source moves the focus rather than
// changing the lens, so a nearer source focuses beyond the screen, as a
// camera does out of focus.
function lensDelay(g, rho) {
  const toFocus = g.screenX - g.apertureX;
  return g.k * (Math.hypot(rho, toFocus) - toFocus);
}

// A Fresnel lens wraps that delay every full wavelength, which is what
// its grooves are. How far through a groove rho sits, 0 to 1; used only
// for drawing.
export function lensGroove(g, rho) {
  return (lensDelay(g, rho) / (2 * Math.PI)) % 1;
}

// The light arriving at height y on the plate, the same as incident() in
// wavefield.js: its strength, how much farther it has come than to the
// plate's center, and its curvature there.
function arriving(g, y) {
  const c = g.curvature;
  const along = y * g.beamDir[1];
  const m = Math.sqrt(1 + 2 * c * along + c * c * y * y);
  return { amplitude: 1 / m, delay: (2 * along + c * y * y) / (1 + m), curvature: c / m };
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
// - slits: [row height, re, im, curvature of the light arriving there].
//   Each
//   open row is a full-width strip; the sum along its length is done in
//   closed form (a standard stationary-phase result), leaving one term
//   per row. re and im include the light arriving from the source.
// - lenses: [ring radius, re, im, lens center height]. The shader
//   averages each ring over points around it, working out the light
//   arriving at each, since an off-center source lights a ring unevenly.
// Light is scaled so the incoming wave has strength 1 and phase 0 at the
// plate's center.
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
    // degree lag, on top of the light arriving here. The shader needs the
    // arriving light's curvature, 1 / its distance from the source.
    const strength = Math.sqrt(g.k / (2 * Math.PI)) * pass * beamProfile(g, y);
    const { amplitude, delay, curvature } = arriving(g, y);
    list.push([y, strength * amplitude, g.k * delay - Math.PI / 4, curvature]);
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
