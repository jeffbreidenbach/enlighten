// Scene layout and optics for the simulator.
//
// The setup is three-dimensional: a small aperture plane and a large
// screen plane centered on one axis, and a light source that sits on the
// axis or is raised above it. The source lights only the aperture plane,
// like a flashlight or a laser beam. Light is a steady wave of one color,
// so every point holds a complex amplitude (strength and phase) worked
// out once by adding up Huygens wavelets from the open parts of the
// aperture plane. Animating only advances the phase, so the pattern is
// settled from the first frame and nothing ever reflects.
//
// The flat view is the slice through the axis that contains the vertical
// center line of each plane. Positions are in grid cells: x runs along
// the axis, y is the height above it.

// The slice is 640 x 300 base cells, plus a 20-cell strip for the screen:
// a 2.2:1 shape that suits laptop windows, leaving bands above and below
// for the controls.
const BASE_W = 640;
const BASE_H = 300;
// Grid cells per base cell. Sizes below are in base cells; the grid is
// finer so that waves, only 4 base cells long, still draw smoothly.
const SCALE = 2;

// Base cells per nanometre of wavelength, so 550 nm is 4 base cells and
// the screen is 75 wavelengths tall. Zooming out this far gives the light
// room to reach the far field.
const CELLS_PER_NM = 4 / 550;
export const DEFAULT_WAVELENGTH = 550;
// How far crests move per drawn frame, in base cells.
const SPEED = 0.094;
export const BG = [6, 8, 14];
export const WALL = [120, 124, 136];
export const GLASS = [150, 190, 220];

export const APERTURES = {
  single: "Single slit",
  double: "Double slit",
  grating: "Sine grating",
  lens: "Fresnel lens",
  lens2: "Two Fresnel lenses",
};

// The aperture plane is this tall (and wide), in base cells: about a
// quarter of the screen, so the beams it sends out can separate on it.
const APERTURE_SIZE = 80;

// The sine grating's transparency follows a cosine across the plane: what
// two interfering plane waves record on film. Its period is the default
// wavelength times the square root of 2 (5.66 base cells), so a plane wave
// arriving at 45 degrees, at the default wavelength, sends its first order
// straight out along the normal (the grating equation: period =
// wavelength / sin 45). Only two beams leave: the zero order, still at 45
// degrees, and the first order, straight ahead.
const GRATING_PERIOD = DEFAULT_WAVELENGTH * CELLS_PER_NM * Math.SQRT2;

// Slits run the full width of the aperture plane, so in the slice each
// one is an opening at a fixed height: [center offset, half width], in
// base cells. At 550 nm a wavelength is 4 base cells.
const OPENINGS = {
  // 1 wavelength wide, the same as each slit of the double slit.
  single: [[0, 2]],
  // 1 wavelength wide, 10 wavelengths apart.
  double: [
    [-20, 2],
    [20, 2],
  ],
};

// Round lenses: their centers' heights and radius, in base cells. Two
// lenses are superimposed: where they overlap, the aperture passes half
// of each. The single lens sits 15 cells above the axis, so it images the
// on-axis source to a spot about 105 cells above the screen's center:
// its light visibly bends, and can't be mistaken for light passing
// straight through. An off-center piece of a zone plate like this is a
// grating plus a lens, which is what an off-axis hologram of a point is.
const LENSES = {
  lens: { centers: [15], radius: 25 },
  lens2: { centers: [-10, 10], radius: 28 },
};

// Row kinds along the aperture line of the slice. Rows outside the
// aperture plane are 0: no light reaches them.
export const ROW_WALL = 1;
export const ROW_OPEN = 2;
export const ROW_LENS = 3;

// How the wavelets are summed: rows of full-width slits, or rings of a
// round lens.
const MODE_SLITS = 0;
export const MODE_LENS = 1;

export function geometry(params) {
  const r = SCALE;
  const W = BASE_W * r;
  const H = BASE_H * r;
  const stripW = 20 * r;
  // The screen plane sits in the strip to the right of the slice.
  const screenX = W + stripW / 2 + r;
  // The point source sits at the left edge, just far enough in for its
  // dot to show; the aperture is 96 base cells in.
  const srcX = 3 * r;
  const barrierX = 96 * r;
  const srcH = params.sourceHeight * r;
  // The plane wave's direction of travel within the slice: tilted down by
  // the beam angle, so a positive angle comes from above, as a raised
  // point source would.
  const angle = (params.beamAngle * Math.PI) / 180;
  return {
    r,
    W,
    H,
    stripW,
    srcX,
    // Height of the source above the axis, within the slice.
    srcH,
    plane: params.light === "plane",
    dirX: Math.cos(angle),
    dirY: -Math.sin(angle),
    barrierX,
    barrierHalf: r,
    centerY: H / 2,
    apertureSize: APERTURE_SIZE * r,
    // The grating's period, in grid cells.
    gratingPeriod: GRATING_PERIOD * r,
    screenX,
    // The lens brings an on-axis source to a point on the screen plane.
    focusX: screenX,
    k: (2 * Math.PI) / (params.wavelength * CELLS_PER_NM * r),
  };
}

// The phase delay a perfect lens adds at distance rho from its center to
// focus light arriving along its own axis onto the focus plane: from the
// point source, or a plane wave (a source infinitely far away). Raising
// the source or tilting the wave moves the focus instead of changing the
// lens.
function lensDelay(g, rho) {
  const toSource = g.barrierX - g.srcX;
  const toFocus = g.focusX - g.barrierX;
  const fromSource = g.plane ? 0 : Math.hypot(rho, toSource) - toSource;
  return g.k * (fromSource + Math.hypot(rho, toFocus) - toFocus);
}

// How strongly the beam lights a point d grid cells from the aperture's
// center. The beam has soft edges, like a laser's Gaussian profile,
// falling to 5% at the aperture's edge, so the edges don't throw off
// ripples of their own. The shader has the same rule.
export function beamProfile(g, d) {
  const t = d / (g.apertureSize / 2);
  return Math.exp(-3 * t * t);
}

// A Fresnel lens wraps that delay every full wavelength, which is what
// its grooves are. Returns how far through a groove rho sits, 0..1; used
// only for drawing.
export function lensGroove(g, rho) {
  return (lensDelay(g, rho) / (2 * Math.PI)) % 1;
}

// Describes the aperture.
//
// `kind` and `groove` give, for each row of the slice, whether the
// aperture line is outside the plane, wall, open or lens there, for
// drawing. For open rows, `groove` instead holds how much the row blocks
// (0 for a clear slit; between 0 and 1 for the sine grating).
//
// `sources` lists the wavelets to sum, four floats each:
// - slits: [height, re, im, distance from the source] per open row. The
//   sum along each slit's length is done analytically (it is a standard
//   stationary-phase result), leaving one term per row.
// - lenses: [radius, re, im, height of the lens center] per ring. The
//   shader averages each ring over points around it, and since an
//   off-center source lights the ring unevenly, it works out the arriving
//   light at each point itself.
// re and im are the wavelet's strength and phase; for slits they include
// the light arriving from the source. Light is scaled so the incoming
// wave has strength 1 where it meets the aperture on the axis; a plane
// wave has strength 1 everywhere.
//
// `lens` is the lens layout in grid cells, or null; its radius is used to
// estimate how much work the sums are.
export function aperture(params, g) {
  const layout = LENSES[params.aperture];
  const lens = layout
    ? { centers: layout.centers.map((c) => c * g.r), radius: layout.radius * g.r }
    : null;
  const kind = new Uint8Array(g.H);
  const groove = new Float32Array(g.H);
  const s0 = g.barrierX - g.srcX;
  const list = [];

  for (let y = 0; y < g.H; y++) {
    const dy = y - g.centerY;
    if (Math.abs(dy) > g.apertureSize / 2) continue;
    kind[y] = ROW_WALL;
    if (lens) {
      const c = lens.centers.find((c) => Math.abs(dy - c) <= lens.radius);
      if (c === undefined) continue;
      kind[y] = ROW_LENS;
      groove[y] = lensGroove(g, Math.abs(dy - c));
      continue;
    }
    // How much of the arriving light the row lets through.
    let pass;
    if (params.aperture === "grating") {
      pass = 0.5 + 0.5 * Math.cos((2 * Math.PI * dy) / g.gratingPeriod);
    } else {
      const open = OPENINGS[params.aperture].some(
        ([center, half]) => Math.abs(dy - center * g.r) <= half * g.r,
      );
      pass = open ? 1 : 0;
    }
    if (pass === 0) continue;
    kind[y] = ROW_OPEN;
    groove[y] = 1 - pass;
    // Strength sqrt(k / 2pi) and a 45 degree lag from summing along the
    // slit. For a point source, 1/sqrt(R) is what remains of its
    // fall-off; a plane wave just arrives with its tilt's phase.
    const amp = Math.sqrt(g.k / (2 * Math.PI)) * pass * beamProfile(g, dy);
    if (g.plane) {
      list.push([dy, amp, g.k * g.dirY * dy - Math.PI / 4, 0]);
    } else {
      const R = Math.hypot(s0, dy - g.srcH);
      list.push([dy, (amp * s0) / Math.sqrt(R), g.k * R - Math.PI / 4, R]);
    }
  }

  for (const center of lens?.centers ?? []) {
    for (let i = 0; i + 0.5 <= lens.radius; i++) {
      const rho = i + 0.5;
      // Huygens-Fresnel factor for a ring: strength k * rho per unit of
      // radius and a 90 degree lag, then the lens's delay.
      const a = (g.k * rho) / lens.centers.length;
      list.push([rho, a, -Math.PI / 2 - lensDelay(g, rho), center]);
    }
  }

  const sources = new Float32Array(Math.max(list.length, 1) * 4);
  list.forEach(([pos, a, phase, w], i) => {
    sources.set([pos, a * Math.cos(phase), a * Math.sin(phase), w], i * 4);
  });
  return {
    mode: lens ? MODE_LENS : MODE_SLITS,
    kind,
    groove,
    lens,
    sources,
    count: list.length,
  };
}

// How much the phase advances per drawn frame.
export function phaseStep(g) {
  return g.k * SPEED * g.r;
}

// Approximate on-screen color of a visible wavelength (Dan Bruton's
// piecewise fit), as [r, g, b] in 0..255.
export function wavelengthColor(nm) {
  let r = 0;
  let gr = 0;
  let b = 0;
  if (nm < 440) [r, b] = [(440 - nm) / 60, 1];
  else if (nm < 490) [gr, b] = [(nm - 440) / 50, 1];
  else if (nm < 510) [gr, b] = [1, (510 - nm) / 20];
  else if (nm < 580) [r, gr] = [(nm - 510) / 70, 1];
  else if (nm < 645) [r, gr] = [1, (645 - nm) / 65];
  else r = 1;
  // Dim toward the ends of the visible range, where the eye is less sensitive.
  const edge = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1;
  return [r, gr, b].map((c) => Math.round(255 * Math.pow(c * edge, 0.8)));
}
