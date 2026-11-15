// How the computed light is drawn: colors, and the shaders that turn the
// light into pixels.

import { float, HEAD, vec3 } from "../glsl.js";
import { BEAM_FALLOFF, ROW_HOLOGRAM, ROW_OPEN, ROW_WALL } from "../physics/aperture.js";
import { SCREEN_STEP } from "../physics/wavefield.js";

export const BG = [6, 8, 14];
export const WALL = [120, 124, 136];
export const GLASS = [150, 190, 220];

// How far crests move per drawn frame, in base cells.
const SPEED = 0.094;

// How much the waves' phase advances per drawn frame.
export function phaseStep(g) {
  return g.k * SPEED * g.scale;
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

// The screen plate face on: intensity in proportion, scaled to the
// brightest point.
export const SCREEN_COLOR_SHADER = `${HEAD}
uniform sampler2D uScreen;
uniform vec3 uHue;
uniform float uMaxIntensity;
out vec4 outColor;
void main() {
  float i = texelFetch(uScreen, ivec2(gl_FragCoord.xy), 0).b;
  outColor = vec4(uHue * clamp(i / uMaxIntensity, 0.0, 1.0), 1.0);
}`;

// The brightest light in each row of the cross section beyond the aperture
// plate, into a texture one pixel wide.
export const FIELD_ROW_MAX_SHADER = `${HEAD}
uniform sampler2D uField;
uniform float uApertureX, uWallHalf;
out vec4 outColor;
void main() {
  int row = int(gl_FragCoord.y);
  float m = 0.0;
  for (int x = int(uApertureX + uWallHalf) + 1; x < textureSize(uField, 0).x; x++) {
    m = max(m, length(texelFetch(uField, ivec2(x, row), 0).xy));
  }
  outColor = vec4(m);
}`;

// The cross section: the waves themselves, the aperture plate's wall, the
// source, and the screen seen edge-on in the strip on the right. It is
// added on top of the 3D scene, so black means clear.
export const SLICE_COLOR_SHADER = `${HEAD}
const float STEP = ${float(SCREEN_STEP)};
uniform sampler2D uField, uRows, uScreen;
uniform vec2 uPhase, uBeamDir;
uniform vec3 uHue;
uniform float uMaxIntensity, uFieldMax, uWidth, uScale, uSourceX, uSourceY, uCurvature, uCenterY;
uniform float uApertureX, uWallHalf, uApertureHalf;
// How much of the screen strip shows: 1 in the cross section, fading to 0
// in the full view, where the screen plate itself stands there.
uniform float uStrip;
out vec4 outColor;

// The light before the plate is drawn as a beam aimed at it: it shows only
// where it is headed for the plate. For a point source that is the wedge
// from the source to the plate's top and bottom edges, narrowing as the
// source moves away; for a plane wave, the band of parallel rays that hit
// it. The beam is soft-edged, as
// in the sums.
float beam(vec2 c) {
  if (c.x >= uApertureX - uWallHalf) return 1.0;
  // Where the ray through c meets the plate, and how much closer together
  // rays are at c than at the plate.
  float hit, squeeze;
  if (uCurvature == 0.0) {
    hit = c.y + uBeamDir.y / uBeamDir.x * (uApertureX - c.x);
    squeeze = 1.0;
  } else {
    float along = c.x - uSourceX;
    if (along <= 0.0) return 0.0;
    float sourceRow = uCenterY + uSourceY;
    hit = sourceRow + (c.y - sourceRow) * (uApertureX - uSourceX) / along;
    squeeze = along / (uApertureX - uSourceX);
  }
  float inside = (uApertureHalf - abs(hit - uCenterY)) * squeeze;
  float t = (hit - uCenterY) / uApertureHalf;
  return smoothstep(-1.5, 1.5, inside) * exp(-${float(BEAM_FALLOFF)} * t * t);
}

void main() {
  vec2 c = floor(gl_FragCoord.xy);
  vec3 rgb = vec3(0.0);
  if (c.x < uWidth) {
    // The plate: wall, hologram, or a sine grating row drawn as wall in
    // proportion to how much it blocks.
    vec4 row = texelFetch(uRows, ivec2(int(c.y), 0), 0);
    float kind = row.x;
    bool partial = kind == ${float(ROW_OPEN)} && row.y > 0.01;
    bool solid = kind == ${float(ROW_WALL)} || kind == ${float(ROW_HOLOGRAM)} || partial;
    if (abs(c.x - uApertureX) <= uWallHalf && solid) {
      rgb = kind == ${float(ROW_WALL)} ? ${vec3(WALL)}
          : partial ? ${vec3(WALL)} * row.y
          : ${vec3(GLASS)} * (0.45 + 0.55 * row.z);
    } else if (uCurvature > 0.0 && distance(c, vec2(uSourceX, uCenterY + uSourceY)) <= 3.0 * uScale) {
      rgb = vec3(1.0);
    } else {
      // Each wave is a smooth cosine at this moment's phase: brightest at
      // the crest, dark in the trough. Its strength sets the brightness in
      // proportion, so weak light looks genuinely weak, scaled so the
      // brightest light beyond the plate is just at full brightness, or
      // the incoming beam if that is brighter. Only the source's light
      // close to the source, which grows without limit, is cut off.
      vec2 u = texelFetch(uField, ivec2(c), 0).xy;
      float strength = length(u);
      float shade = 0.5 + 0.5 * dot(u, uPhase) / max(strength, 1e-6);
      rgb = uHue * shade * min(strength / uFieldMax, 1.0) * beam(c);
    }
  } else {
    // The screen strip, from the screen on: the center line of the screen
    // plate, which is computed more coarsely, so blended between its
    // nearest two rows.
    float at = (c.y + 0.5) / STEP - 0.5;
    int column = int(uCenterY / STEP);
    int below = int(floor(at));
    int top = int(textureSize(uScreen, 0).y) - 1;
    float i = mix(
      texelFetch(uScreen, ivec2(column, clamp(below, 0, top)), 0).b,
      texelFetch(uScreen, ivec2(column, clamp(below + 1, 0, top)), 0).b,
      fract(at));
    rgb = uHue * clamp(i / uMaxIntensity, 0.0, 1.0) * uStrip;
  }
  outColor = vec4(rgb, 1.0);
}`;
