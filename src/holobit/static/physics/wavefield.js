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
//   uPlate, uPlateRows, uPlateCols, uPlateStep, uMirror
//                  a hologram's grid (see plateSum)

import { float, HEAD } from "../glsl.js";
import { MODE_PLATE, ROW_HOLOGRAM, ROW_OPEN } from "./aperture.js";

// The light at a point x along the axis and p across it, where p.y is the
// height above the axis and p.x the distance out of the cross section.
const WAVEFIELD = `
uniform float uK, uCurvature, uApertureX, uWallHalf, uApertureHalf, uCenterY;
uniform int uMode, uWaveletCount, uPlateRows, uPlateCols;
uniform float uPlateStep;
uniform bool uMirror;
uniform vec2 uBeamDir;
uniform sampler2D uRows, uWavelets, uPlate;

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
  float spread = sqrt(r / (1.0 + w.w * r));
  return spread * cmul(w.yz, wavelet(r, dx));
}

// A hologram: the sum of the wavelets from the grid of points across it
// (uPlate, uPlateRows by uPlateCols points, uPlateStep apart, centered on the
// plate). Every hologram is the same on either side of the cross
// section, so in it (uMirror) each point out of it stands in for its
// mirror image too.
vec2 plateSum(float dx, vec2 p) {
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
      vec2 w = cmul(texelFetch(uPlate, ivec2(j, i), 0).xy, wavelet(r, dx));
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
  if (uMode == ${MODE_PLATE}) return plateSum(dx, p);
  vec2 u = vec2(0.0);
  for (int i = 0; i < uWaveletCount; i++) {
    u += slitRow(texelFetch(uWavelets, ivec2(i, 0), 0), dx, p);
  }
  return u;
}`;

// The screen is computed at every SCREEN_STEP grid cells, half the
// resolution of the cross section: a quarter of the work, and its
// patterns, the holograms' spots included, are far wider than that.
export const SCREEN_STEP = 2;

// The cross section: R, G = the light's complex amplitude.
export const FIELD_SHADER = `${HEAD}${WAVEFIELD}
out vec4 outColor;
void main() {
  vec2 c = floor(gl_FragCoord.xy);
  outColor = vec4(lightAt(c.x, vec2(0.0, c.y - uCenterY)), 0.0, 0.0);
}`;

// The screen plate, seen face on: R, G = complex amplitude, B = intensity.
// Each pixel is the light at the middle of the SCREEN_STEP grid cells it
// covers. Full-width slits give the same light all the
// way across, so only the height matters for them.
export const SCREEN_SHADER = `${HEAD}${WAVEFIELD}
uniform float uScreenX;
out vec4 outColor;
void main() {
  vec2 p = (floor(gl_FragCoord.xy) + 0.5) * ${float(SCREEN_STEP)} - 0.5 - uCenterY;
  vec2 u = lightAt(uScreenX, uMode == ${MODE_PLATE} ? p : vec2(0.0, p.y));
  outColor = vec4(u, dot(u, u), 0.0);
}`;
