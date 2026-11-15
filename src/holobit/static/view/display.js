// How the computed light is drawn: colors, and the shaders that turn the
// light into pixels.

import { float, HEAD, vec3 } from "../glsl.js";
import { BEAM_FALLOFF, FLAT_TOP, ROW_HOLOGRAM, ROW_OPEN, ROW_WALL } from "../physics/aperture.js";
import { SCREEN_STEP } from "../physics/wavefield.js";

export const BG = [6, 8, 14];
export const WALL = [120, 124, 136];
export const GLASS = [150, 190, 220];
// Virtual light, which only seems to be there, is drawn in white, fading
// slowly in and out (see ghost()).
const VIRTUAL = [235, 235, 235];
const GHOST_SECONDS = 6;

// How bright virtual light is drawn at time t, in seconds: rising from
// black to full brightness and back every GHOST_SECONDS, lingering in
// the dark.
export function ghost(t) {
  return (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / GHOST_SECONDS)) ** 2;
}

// With the beam reversed, an eye looks through the plate toward the
// screen, from where the light leaving the plate heads: drawn side on in
// white outline, fading in and out with the virtual light it sees. It
// stands EYE_BACK base cells in front of the plate, its eyeball
// EYE_RADIUS across, its lens LENS of that ahead of its middle, and its
// retina at the back.
const EYE_BACK = 46;
const EYE_RADIUS = 24;
const LENS = 0.6;
// How far in from the back of the eyeball the retina is drawn, in base
// cells, clear of the eyeball's outline.
const RETINA_IN = 2;

// Where the eye is, in grid cells: x and y its middle, y above the axis,
// in line with the middle of the image on the screen and `seen`, the
// middle of the part of the plate it looks through, so that the light
// from there reaches it. Its lens casts the image on the screen, the
// virtual image it sees, onto its retina: upside down, and smaller by
// `shrink`, the lens's distance from the retina over its distance from
// the screen.
export function eyePlace(g, seen) {
  const toScreen = g.screenX - g.apertureX;
  const r = EYE_RADIUS * g.scale;
  const x = g.apertureX - EYE_BACK * g.scale;
  const lensX = x + LENS * r;
  return {
    x,
    y: (seen * (toScreen + EYE_BACK * g.scale)) / toScreen,
    retinaX: x - r + RETINA_IN * g.scale,
    shrink: (lensX - (x - r)) / (g.screenX - lensX),
  };
}


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
// brightest point; in white when the light is virtual. Also the eye's
// retina, faded by uFade with the eye.
export const SCREEN_COLOR_SHADER = `${HEAD}
uniform sampler2D uScreen;
uniform vec3 uHue;
uniform float uMaxIntensity, uGhost, uFade;
uniform bool uReversed;
out vec4 outColor;
void main() {
  float i = texelFetch(uScreen, ivec2(gl_FragCoord.xy), 0).b;
  vec3 hue = uReversed ? ${vec3(VIRTUAL)} * uGhost : uHue;
  outColor = vec4(hue * clamp(i / uMaxIntensity, 0.0, 1.0) * uFade, 1.0);
}`;

// The brightest light in each row of the cross section beyond the aperture
// plate (before it, with the beam reversed, and the virtual light beyond
// it), into a texture one pixel wide.
export const FIELD_ROW_MAX_SHADER = `${HEAD}
uniform sampler2D uField;
uniform float uApertureX, uWallHalf;
uniform bool uReversed;
out vec4 outColor;
void main() {
  int row = int(gl_FragCoord.y);
  float m = 0.0;
  int first = uReversed ? 0 : int(uApertureX + uWallHalf) + 1;
  int last = uReversed ? int(uApertureX - uWallHalf) : textureSize(uField, 0).x;
  for (int x = first; x < last; x++) {
    m = max(m, length(texelFetch(uField, ivec2(x, row), 0).xy));
  }
  for (int x = int(uApertureX + uWallHalf) + 1; uReversed && x < textureSize(uField, 0).x; x++) {
    m = max(m, length(texelFetch(uField, ivec2(x, row), 0).zw));
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
// The heights the beam lights on the plate, from its center, and how far
// above and below it the two beams of a stacked plate are centered.
uniform vec2 uLit;
// Whether the beam is the flat-topped wide one (see aperture.js).
uniform bool uFlatTop;
uniform float uBeamGap;
// How much of the screen strip shows: 1 in the cross section, fading to 0
// in the full view, where the screen plate itself stands there.
uniform float uStrip;
// Whether the beam is reversed, coming from the screen's side: the light
// is computed mirrored, so the source and beam are placed mirrored too,
// and a hologram's virtual light is drawn over it in white, uGhost as
// bright as it can be.
uniform bool uReversed;
uniform float uGhost;
out vec4 outColor;

// A wave as drawn: a smooth cosine at this moment's phase, brightest at
// the crest and dark in the trough, scaled by its strength (see main()).
float wave(vec2 u) {
  float strength = length(u);
  float shade = 0.5 + 0.5 * dot(u, uPhase) / max(strength, 1e-6);
  return shade * min(strength / uFieldMax, 1.0);
}

// The eye (see eyeHeight), side on, facing the plate: a faintly filled
// eyeball with the bulge of the cornea at its front, the lens just behind
// the iris, which is open in the middle for the pupil. Returns its
// brightness and how much it covers.
uniform float uEyeY;

// How strongly a line drawn at distance d covers a pixel.
float line(float d) {
  return 1.0 - smoothstep(1.2, 2.2, d);
}

// How strongly a pixel is inside a shape, from its distance outside it
// (negative inside).
float inside(float d) {
  return 1.0 - smoothstep(-1.0, 1.0, d);
}

vec2 eye(vec2 c) {
  float r = ${float(EYE_RADIUS)} * uScale;
  vec2 q = c - vec2(uApertureX - ${float(EYE_BACK)} * uScale, uCenterY + uEyeY);
  vec2 corneaMiddle = vec2(0.55 * r, 0.0);
  float corneaR = 0.6 * r;
  float ball = length(q) - r;
  float cornea = length(q - corneaMiddle) - corneaR;
  // The faint fill, then the solid parts on top.
  float fill = inside(min(ball, cornea));
  float b = 0.18 * fill;
  float a = 0.9 * fill;
  float outline = max(line(abs(ball)) * step(0.0, cornea), line(abs(cornea)) * step(0.0, ball));
  float lens = inside((length((q - vec2(${float(LENS)} * r, 0.0)) / vec2(0.13 * r, 0.36 * r)) - 1.0) * 0.13 * r);
  float iris = inside(abs(q.x - 0.8 * r) - 0.04 * r) * inside(abs(abs(q.y) - 0.43 * r) - 0.19 * r);
  for (int i = 0; i < 3; i++) {
    float layer = i == 0 ? outline : i == 1 ? lens : iris;
    float bright = i == 0 ? 1.0 : i == 1 ? 0.95 : 0.85;
    b = mix(b, bright, layer);
    a = max(a, layer);
  }
  return vec2(b, a);
}

// The image the eye's lens casts on its retina, seen edge on: the slice
// of the image on the screen through the cross section, upside down and
// smaller (see eyePlace). It is real light, focused by the lens, so drawn
// in the light's color, though it fades with the eye. Returns its
// brightness, 0 off the retina.
float retina(vec2 c) {
  float r = ${float(EYE_RADIUS)} * uScale;
  float x = uApertureX - ${float(EYE_BACK)} * uScale;
  float lensX = x + ${float(LENS)} * r;
  float back = x - r + ${float(RETINA_IN)} * uScale;
  float lensY = uCenterY + uEyeY;
  if (abs(c.x - back) > 1.0 || abs(c.y - lensY) > 0.8 * r) return 0.0;
  // The point of the screen the lens casts here, through its middle.
  float y = lensY - (c.y - lensY) * (uWidth - lensX) / (lensX - (x - r));
  int row = int(y / STEP);
  if (row < 0 || row >= textureSize(uScreen, 0).y) return 0.0;
  float i = texelFetch(uScreen, ivec2(int(uCenterY / STEP), row), 0).b;
  return clamp(i / uMaxIntensity, 0.0, 1.0);
}

// The light before the plate is drawn as a beam aimed at it: it shows only
// where it is headed for the part of the plate it lights (uLit). For a
// point source that is the wedge from the source to that part's top and
// bottom edges, narrowing as the source moves away; for a plane wave, the
// band of parallel rays that hit it. The beam is soft-edged, as in the
// sums.
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
  float inside = min(hit - uCenterY - uLit.x, uLit.y - hit + uCenterY) * squeeze;
  float fromCenter = hit - uCenterY;
  float t = (fromCenter - (fromCenter >= 0.0 ? uBeamGap : -uBeamGap)) / uApertureHalf;
  float power = uFlatTop ? ${float(FLAT_TOP)} : 1.0;
  return smoothstep(-1.5, 1.5, inside) * exp(-${float(BEAM_FALLOFF)} * pow(t * t, power));
}

void main() {
  vec2 c = floor(gl_FragCoord.xy);
  // Where c is in the light as computed: mirrored about the plate when the
  // beam is reversed.
  vec2 m = uReversed ? vec2(2.0 * uApertureX - c.x, c.y) : c;
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
    } else if (uCurvature > 0.0 && distance(m, vec2(uSourceX, uCenterY + uSourceY)) <= 3.0 * uScale) {
      rgb = vec3(1.0);
    } else {
      // Each wave is a smooth cosine at this moment's phase: brightest at
      // the crest, dark in the trough. Its strength sets the brightness in
      // proportion, so weak light looks genuinely weak, scaled so the
      // brightest light beyond the plate is just at full brightness, or
      // the incoming beam if that is brighter. Only the source's light
      // close to the source, which grows without limit, is cut off.
      vec4 f = texelFetch(uField, ivec2(c), 0);
      rgb = uHue * wave(f.xy) * beam(m) + ${vec3(VIRTUAL)} * uGhost * wave(f.zw);
    }
    if (uReversed) {
      vec2 e = eye(c);
      rgb = mix(rgb, ${vec3(VIRTUAL)} * e.x, e.y * uGhost);
      rgb = max(rgb, uHue * retina(c) * uGhost);
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
    vec3 hue = uReversed ? ${vec3(VIRTUAL)} * uGhost : uHue;
    rgb = hue * clamp(i / uMaxIntensity, 0.0, 1.0) * uStrip;
  }
  outColor = vec4(rgb, 1.0);
}`;
