// The core calculation: adding up the wavelets at every point.
//
// These shaders run once per pixel on the GPU. Each works out the light at
// its point as a complex amplitude, a 2-vector (re, im): the light from
// the source before the aperture plate, and the sum of the plate's
// wavelets (see aperture.js) after it.
//
// FIELD_SHADER fills the cross section; SCREEN_SHADER fills the face of
// the screen plate. Both take these uniforms:
//   uK             wavenumber, 2 pi / wavelength
//   uCurvature, uBeamDir
//                  the light: a point source 1 / uCurvature from the
//                  plate's center, its light arriving there along
//                  uBeamDir; or, at curvature 0, a plane wave
//   uApertureX, uWallHalf, uApertureHalf, uCenterY
//                  the plate's column, half its thickness, half its
//                  height, and the axis's row
//   uRows          what each row of the aperture line is (aperture.js)
//   uWavelets, uWaveletCount, uMode
//                  the wavelets to sum, and whether they are slit rows or
//                  a hologram's grid
//   uImages, uImageCount
//                  with the beam reversed, the sine grating's image
//                  light's rows (see imageWavelet in aperture.js)
//   uPlate, uPlateRows, uPlateCols, uPlateStep, uMirror
//                  a hologram's grid (see plateSum)
//   uReversed      whether the light comes from the screen's side instead
//
// Light from the screen's side, the beam reversed, is the mirror image of
// light from the source's side arriving at the opposite angle (which
// main.js hands over): so it is worked out that way, and the cross
// section mirrored about the plate. The light leaving the plate then
// heads away from the screen, and none reaches it. A hologram's image
// light, though, now seems to come from the screen's side: from its
// image, a virtual one. That virtual light is the image light leaving the
// plate, run backwards to where it seems to come from: the conjugate of
// the sum of wavelets sent from the conjugate of that light. It is worked
// out alongside (see plateGrid in aperture.js).

import { float, HEAD } from "../glsl.js";
import { MODE_PLATE, ROW_HOLOGRAM, ROW_OPEN } from "./aperture.js";

// The light at a point x along the axis and p across it, where p.y is the
// height above the axis and p.x the distance out of the cross section.
const WAVEFIELD = `
uniform float uK, uCurvature, uApertureX, uWallHalf, uApertureHalf, uCenterY;
uniform int uMode, uWaveletCount, uPlateRows, uPlateCols, uImageCount;
uniform float uPlateStep;
uniform bool uMirror, uReversed;
uniform vec2 uBeamDir;
uniform sampler2D uRows, uWavelets, uPlate, uImages;

const float TAU = 6.28318531;

vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// A unit wave after travelling distance d: phase k d.
vec2 wave(float d) {
  float kd = mod(uK * d, TAU);
  return vec2(cos(kd), sin(kd));
}

// One wavelet, seen from distance r, dx of it along the axis. It fades as
// 1/r, as a spherical wave does, and is weaker sideways (the obliquity
// factor (1 + cos theta) / 2).
vec2 wavelet(float r, float dx) {
  return 0.5 * (1.0 + dx / r) / r * wave(r);
}

// The light arriving from the source, with strength 1 and phase 0 at the
// plate's center. With the source D = 1 / uCurvature away, a point q from
// the plate's center is d = D m away, where m is below; the spherical
// wave fades as D / d = 1 / m, and its phase is set by d - D. That is
// rearranged so it never works with D itself: at curvature 0 it becomes
// the plane wave, phase set by how far along uBeamDir q is.
vec2 incident(float x, vec2 p) {
  vec3 q = vec3(x - uApertureX, p.x, p.y);
  float along = dot(vec3(uBeamDir.x, 0.0, uBeamDir.y), q);
  float c = uCurvature;
  float m = sqrt(max(1.0 + 2.0 * c * along + c * c * dot(q, q), 0.0));
  return wave((2.0 * along + c * dot(q, q)) / (1.0 + m)) / max(m, 0.5 * c);
}

// A full-width slit row at height rowY, where the arriving light has
// curvature 1 / R, R its distance from the source. Summing its wavelets
// along the row (in closed form) leaves one wavelet whose strength fades
// as 1/sqrt(r (R + r)), scaled to 1/sqrt(r) for a plane wave.
vec2 slitRow(vec4 w, float dx, vec2 p) {
  float rowY = w.x;
  float r = length(vec2(dx, p.y - rowY));
  // (Virtual light curves the other way, and may focus; abs keeps it
  // finite there.)
  float spread = sqrt(r / max(abs(1.0 + w.w * r), 1e-3));
  return spread * cmul(w.yz, wavelet(r, dx));
}

// A hologram: the sum of the wavelets from the grid of points across it
// (uPlate, uPlateRows by uPlateCols points, uPlateStep apart, centered on the
// plate). Every hologram is the same on either side of the cross
// section, so in it (uMirror) each point out of it stands in for its
// mirror image too. With image, it sums the image's light alone instead.
vec2 plateSum(float dx, vec2 p, bool image) {
  int rowMid = (uPlateRows - 1) / 2;
  int mid = (uPlateCols - 1) / 2;
  int first = uMirror ? mid : 0;
  vec2 sum = vec2(0.0);
  for (int i = 0; i < uPlateRows; i++) {
    float dy = p.y - float(i - rowMid) * uPlateStep;
    float across2 = dx * dx + dy * dy;
    for (int j = first; j < uPlateCols; j++) {
      float dz = p.x - float(j - mid) * uPlateStep;
      float r = sqrt(across2 + dz * dz);
      vec4 point = texelFetch(uPlate, ivec2(j, i), 0);
      vec2 w = cmul(image ? point.zw : point.xy, wavelet(r, dx));
      sum += uMirror && j > mid ? 2.0 * w : w;
    }
  }
  return sum;
}

vec2 lightAt(float x, vec2 p) {
  // Before the plate, and in its openings, the light is the source's.
  bool inWall = abs(x - uApertureX) <= uWallHalf;
  float kind = inWall ? texelFetch(uRows, ivec2(int(p.y + uCenterY), 0), 0).x : 0.0;
  bool open = kind == ${float(ROW_OPEN)} || kind == ${float(ROW_HOLOGRAM)};
  if (x < uApertureX - uWallHalf || (inWall && open)) return incident(x, p);
  if (inWall) return vec2(0.0);

  // After the plate, it is the sum of the wavelets.
  float dx = x - uApertureX;
  if (uMode == ${MODE_PLATE}) return plateSum(dx, p, false);
  vec2 u = vec2(0.0);
  for (int i = 0; i < uWaveletCount; i++) {
    u += slitRow(texelFetch(uWavelets, ivec2(i, 0), 0), dx, p);
  }
  return u;
}

// The virtual light at x beyond the plate, with the beam reversed: from
// a hologram's grid, or the sine grating's rows (uImages).
vec2 virtualAt(float x, vec2 p) {
  if (x <= uApertureX + uWallHalf) return vec2(0.0);
  float dx = x - uApertureX;
  vec2 u = vec2(0.0);
  if (uMode == ${MODE_PLATE}) {
    u = plateSum(dx, p, true);
  } else {
    for (int i = 0; i < uImageCount; i++) {
      u += slitRow(texelFetch(uImages, ivec2(i, 0), 0), dx, p);
    }
  }
  return vec2(u.x, -u.y);
}`;

// The screen is computed at every SCREEN_STEP grid cells, half the
// resolution of the cross section: a quarter of the work, and its
// patterns, the holograms' spots included, are far wider than that.
export const SCREEN_STEP = 2;

// The cross section: R, G = the light's complex amplitude; B, A = the
// virtual light's, with the beam reversed.
export const FIELD_SHADER = `${HEAD}${WAVEFIELD}
out vec4 outColor;
void main() {
  vec2 c = floor(gl_FragCoord.xy);
  vec2 p = vec2(0.0, c.y - uCenterY);
  if (uReversed) outColor = vec4(lightAt(2.0 * uApertureX - c.x, p), virtualAt(c.x, p));
  else outColor = vec4(lightAt(c.x, p), 0.0, 0.0);
}`;

// The screen plate, seen face on: R, G = complex amplitude, B = intensity;
// with the beam reversed, of the virtual light.
// Each pixel is the light at the middle of the SCREEN_STEP grid cells it
// covers. Full-width slits give the same light all the
// way across, so only the height matters for them.
export const SCREEN_SHADER = `${HEAD}${WAVEFIELD}
uniform float uScreenX;
out vec4 outColor;
void main() {
  vec2 p = (floor(gl_FragCoord.xy) + 0.5) * ${float(SCREEN_STEP)} - 0.5 - uCenterY;
  vec2 u = uReversed
    ? virtualAt(uScreenX, p)
    : lightAt(uScreenX, uMode == ${MODE_PLATE} ? p : vec2(0.0, p.y));
  outColor = vec4(u, dot(u, u), 0.0);
}`;
