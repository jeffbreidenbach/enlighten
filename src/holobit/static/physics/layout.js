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

// The aperture plate is this tall (and wide), in base cells: about a
// quarter of the screen.
const APERTURE_SIZE = 80;
// The aperture plate is 96 base cells in. At an incident angle of 0 the
// point source sits at the left edge, just far enough in for its dot to
// show; at other angles it moves along an arc, staying the same distance
// from the plate's center.
const APERTURE_X = 96;
const SOURCE_DISTANCE = 93;

// A wavelength's length in base cells.
export function wavelengthCells(nm) {
  return nm * CELLS_PER_NM;
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
  return {
    scale,
    // The cross section, and the strip on its right where the screen is
    // drawn edge-on.
    W,
    H,
    stripW,
    centerY: H / 2,

    // The light: a point source, at sourceY above the axis and
    // sourceDistance from the plate's center; or a plane wave travelling
    // along beamDir.
    planeWave: params.light === "plane",
    sourceX: (APERTURE_X - SOURCE_DISTANCE * Math.cos(angle)) * scale,
    sourceY: SOURCE_DISTANCE * Math.sin(angle) * scale,
    sourceDistance: SOURCE_DISTANCE * scale,
    beamDir: [Math.cos(angle), -Math.sin(angle)],
    // The wavenumber: 2 pi over the wavelength.
    k: (2 * Math.PI) / (wavelengthCells(params.wavelength) * scale),

    // The aperture plate, as tall as APERTURE_SIZE, drawn as a wall two
    // grid cells thick.
    apertureX: APERTURE_X * scale,
    apertureSize: APERTURE_SIZE * scale,
    wallHalf: scale,

    // The screen, in the middle of the strip.
    screenX: W + stripW / 2 + scale,
  };
}
