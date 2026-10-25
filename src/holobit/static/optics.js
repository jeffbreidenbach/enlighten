// Scene layout and optics for the simulator.
//
// The setup is three-dimensional: an aperture plane and a screen plane
// centered on one axis, and a point source that sits on the axis or is
// raised above it. Light is a steady wave of one
// color, so every point holds a complex amplitude (strength and phase)
// worked out once by adding up Huygens wavelets from the open parts of
// the aperture plane. Animating only advances the phase, so the pattern
// is settled from the first frame and nothing ever reflects.
//
// The flat view is the slice through the axis that contains the vertical
// center line of each plane. Positions are in grid cells: x runs along
// the axis, y is the height above it.

const BASE_W = 480;
const BASE_H = 300;
// Grid cells per base cell. Sizes below are set for the 480x300 base
// grid; raising this scales everything up so the scene looks the same,
// just with finer cells.
const SCALE = 1;

// Grid cells per nanometre of wavelength, so 550 nm is 16 cells.
const CELLS_PER_NM = 16 / 550;
// How far crests move per drawn frame, in cells of the base grid.
const SPEED = 0.375;
// How strongly the light's strength maps to brightness.
export const GAIN = 2.5;

export const BG = [6, 8, 14];
export const WALL = [120, 124, 136];
export const GLASS = [150, 190, 220];

export const APERTURES = {
  single: "Single slit",
  double: "Double slit",
  grating: "Grating",
  lens: "Fresnel lens",
  lens2: "Two Fresnel lenses",
};

// Slits run the full width of the aperture plane, so in the slice each
// one is an opening at a fixed height: [center offset, half width], in
// base cells.
const OPENINGS = {
  single: [[0, 20]],
  double: [
    [-30, 4],
    [30, 4],
  ],
  // 50% open: a 30-cell period, 15 open and 15 blocked, across the whole
  // 300-cell height of the plane. The period is fine enough that only the
  // zero and first orders leave the grating.
  grating: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((n) => [n * 30, 7.5]),
};
// Round lenses with this radius, centered at these heights in base cells.
// Two lenses are superimposed: where they overlap, the aperture passes
// half of each.
const LENS_RADIUS = 105;
const LENS_CENTERS = {
  lens: [0],
  lens2: [-30, 30],
};

// Row kinds along the aperture line of the slice.
export const ROW_WALL = 0;
export const ROW_OPEN = 1;
export const ROW_LENS = 2;

// How the wavelets are summed: rows of full-width slits, or rings of a
// round lens.
export const MODE_SLITS = 0;
export const MODE_LENS = 1;

export function geometry(params) {
  const r = SCALE;
  const W = BASE_W * r;
  const H = BASE_H * r;
  const stripW = 20 * r;
  // The screen plane sits in the strip to the right of the slice.
  const screenX = W + stripW / 2 + r;
  // The point source sits at the left edge, just far enough in for its
  // dot to show; the aperture is a fifth of the way across.
  const srcX = 3 * r;
  const barrierX = Math.round(W * 0.2);
  const srcH = params.sourceHeight * r;
  // A plane wave travels as if from a far-off source in the direction of
  // the source point, so raising the source tilts it. This is its
  // direction of travel within the slice.
  const toPlane = Math.hypot(barrierX - srcX, srcH);
  return {
    r,
    W,
    H,
    stripW,
    srcX,
    // Height of the source above the axis, within the slice.
    srcH,
    plane: params.light === "plane",
    dirX: (barrierX - srcX) / toPlane,
    dirY: -srcH / toPlane,
    barrierX,
    barrierHalf: r,
    centerY: H / 2,
    screenX,
    // The lens brings an on-axis source to a point on the screen plane.
    focusX: screenX,
    lensRadius: LENS_RADIUS * r,
    k: (2 * Math.PI) / (params.wavelength * CELLS_PER_NM * r),
  };
}

// The phase delay a perfect lens adds at distance rho from its center to
// focus a source on its own axis onto the focus plane. The lens is fixed, so
// raising the source moves the focus instead of changing the lens.
function lensDelay(g, rho) {
  const toSource = g.barrierX - g.srcX;
  const toFocus = g.focusX - g.barrierX;
  return g.k * (Math.hypot(rho, toSource) - toSource + Math.hypot(rho, toFocus) - toFocus);
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
// aperture line is wall, open or lens there, for drawing.
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
export function aperture(params, g) {
  const lensCenters = (LENS_CENTERS[params.aperture] ?? []).map((c) => c * g.r);
  const lens = lensCenters.length > 0;
  const kind = new Uint8Array(g.H);
  const groove = new Float32Array(g.H);
  const s0 = g.barrierX - g.srcX;
  const list = [];

  for (let y = 0; y < g.H; y++) {
    const dy = y - g.centerY;
    if (lens) {
      const c = lensCenters.find((c) => Math.abs(dy - c) <= g.lensRadius);
      if (c === undefined) continue;
      kind[y] = ROW_LENS;
      groove[y] = lensGroove(g, Math.abs(dy - c));
      continue;
    }
    const open = OPENINGS[params.aperture].some(
      ([center, half]) => Math.abs(dy - center * g.r) <= half * g.r,
    );
    if (!open) continue;
    kind[y] = ROW_OPEN;
    // Strength sqrt(k / 2pi) and a 45 degree lag from summing along the
    // slit. For a point source, 1/sqrt(R) is what remains of its
    // fall-off; a plane wave just arrives with its tilt's phase.
    const amp = Math.sqrt(g.k / (2 * Math.PI));
    if (g.plane) {
      list.push([dy, amp, g.k * g.dirY * dy - Math.PI / 4, 0]);
    } else {
      const R = Math.hypot(s0, dy - g.srcH);
      list.push([dy, (amp * s0) / Math.sqrt(R), g.k * R - Math.PI / 4, R]);
    }
  }

  for (const center of lensCenters) {
    for (let i = 0; i + 0.5 <= g.lensRadius; i++) {
      const rho = i + 0.5;
      // Huygens-Fresnel factor for a ring: strength k * rho per unit of
      // radius and a 90 degree lag, then the lens's delay.
      const a = (g.k * rho) / lensCenters.length;
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
    lensCenters,
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
