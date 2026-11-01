// Where everything sits, and the scale of the simulation.
//
// The setup is three-dimensional: a light source, a small aperture plate
// and a large screen, all centered on one axis. The cross section is the
// slice through that axis that contains each plate's vertical center
// line. Positions are in grid cells, the pixels of the cross section: x
// runs along the axis, y is the height.

// The cross section is 640 x 300 base cells, plus a 20-cell strip for the
// screen: a 2.2:1 shape that suits laptop windows, leaving a band below
// for the controls.
const BASE_W = 640;
const BASE_H = 300;
// Grid cells per base cell. Sizes are given in base cells; the grid is
// twice as fine so that waves, only 4 base cells long, draw smoothly.
const SCALE = 2;

// Base cells per nanometre, so a 550 nm wave is 4 base cells long and the
// screen is 75 wavelengths tall: zoomed out far enough that the beams
// leaving the aperture can separate on the screen.
const CELLS_PER_NM = 4 / 550;
export const DEFAULT_WAVELENGTH = 550;

// The aperture plate is square, and by default this tall, in base cells:
// about a quarter of the screen. The plate size slider runs from
// MIN_PLATE to MAX_PLATE.
export const DEFAULT_PLATE = 80;
export const MIN_PLATE = 48;
export const MAX_PLATE = 160;
// The aperture plate is 96 base cells in. At its nearest, and an incident
// angle of 0, the point source sits at the left edge, just far enough in
// for its dot to show; at other angles it moves along an arc, staying the
// same distance from the plate's center.
const APERTURE_X = 96;
const NEAREST_SOURCE = 93;

// A wavelength's length in base cells.
export function wavelengthCells(nm) {
  return nm * CELLS_PER_NM;
}

// The source distance slider runs from 0, the nearest, to 100, infinitely
// far. Like a camera's focus ring it is even in curvature, 1 / distance,
// which falls from 1 / NEAREST_SOURCE to 0: the wavefronts flatten
// steadily, and the far end is a plane wave.
export const FARTHEST = 100;

function curvature(distance) {
  return (1 - distance / FARTHEST) / NEAREST_SOURCE;
}

// A length in base cells, in micrometres.
export function microns(cells) {
  return cells / CELLS_PER_NM / 1000;
}

// The source's distance from the plate, in micrometres, or Infinity.
export function sourceMicrons(distance) {
  return microns(1 / curvature(distance));
}

// Everything the calculation and the drawing need to know about the
// current settings, in grid cells.
export function geometry(params) {
  const scale = SCALE;
  const W = BASE_W * scale;
  const H = BASE_H * scale;
  const stripW = 20 * scale;
  // The incident angle: the direction the light arrives from at the
  // center of the aperture plate, for either light. Positive comes from
  // above.
  const angle = (params.angle * Math.PI) / 180;
  // The source's distance from the plate's center, in base cells; 0 for a
  // plane wave, where there is no source to place.
  const c = curvature(params.distance);
  const toSource = c > 0 ? 1 / c : 0;
  return {
    scale,
    // The cross section, and the strip on its right where the screen is
    // drawn edge-on.
    W,
    H,
    stripW,
    centerY: H / 2,

    // The light: a point source, 1 / curvature from the plate's center,
    // at (sourceX, sourceY), its light arriving there travelling along
    // beamDir. A curvature of 0 is a plane wave travelling along beamDir,
    // and has no source.
    curvature: c / scale,
    sourceX: (APERTURE_X - toSource * Math.cos(angle)) * scale,
    sourceY: toSource * Math.sin(angle) * scale,
    beamDir: [Math.cos(angle), -Math.sin(angle)],
    // The wavenumber: 2 pi over the wavelength.
    k: (2 * Math.PI) / (wavelengthCells(params.wavelength) * scale),

    // The aperture plate, params.plate base cells tall, drawn as a wall
    // two grid cells thick, and the largest it can be.
    apertureX: APERTURE_X * scale,
    apertureSize: params.plate * scale,
    maxApertureSize: MAX_PLATE * scale,
    wallHalf: scale,

    // The screen, in the middle of the strip.
    screenX: W + stripW / 2 + scale,
  };
}
